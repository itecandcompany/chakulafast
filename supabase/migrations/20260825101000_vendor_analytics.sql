-- ===========================================================================
-- ChakulaFast — vendor analytics.
--
-- A restaurant owner's two real questions are "what am I taking?" and "what
-- should I prep for?". Both are aggregations over their own orders, which is
-- work Postgres should do rather than shipping every order to the browser to
-- be summed there.
--
-- All three functions are SECURITY DEFINER and therefore bypass RLS, so each
-- one re-checks ownership explicitly against auth.uid() before returning a
-- single row. An admin is allowed through as well, for support.
-- ===========================================================================

-- Shared gate. Raises rather than returning empty so a mistake is loud.
CREATE OR REPLACE FUNCTION public.assert_owns_restaurant(_restaurant_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN; -- service role: trusted server-side caller
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = _restaurant_id AND r.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this restaurant';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_owns_restaurant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_owns_restaurant(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Headline numbers over a rolling window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_summary(_restaurant_id UUID, _days INT DEFAULT 30)
RETURNS TABLE (
  orders_total BIGINT,
  orders_completed BIGINT,
  orders_cancelled BIGINT,
  takings NUMERIC,
  average_order NUMERIC,
  -- The promise the platform makes, measured: of the orders that were marked
  -- ready, how many were ready before the customer said they'd arrive.
  ready_on_time_pct NUMERIC,
  -- Median minutes from 'accepted' to 'ready'. Median, not mean, because one
  -- forgotten ticket left open overnight would wreck an average.
  median_prep_minutes NUMERIC,
  rating NUMERIC,
  rating_count INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  since TIMESTAMPTZ := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
BEGIN
  PERFORM public.assert_owns_restaurant(_restaurant_id);

  RETURN QUERY
  WITH o AS (
    SELECT * FROM public.orders
    WHERE restaurant_id = _restaurant_id AND created_at >= since
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE o.status = 'completed')::bigint,
    count(*) FILTER (WHERE o.status = 'cancelled')::bigint,
    COALESCE(sum(o.total) FILTER (WHERE o.status = 'completed'), 0)::numeric,
    COALESCE(round(avg(o.total) FILTER (WHERE o.status = 'completed'), 0), 0)::numeric,
    CASE
      WHEN count(*) FILTER (WHERE o.ready_at IS NOT NULL) = 0 THEN NULL
      ELSE round(
        100.0
        * count(*) FILTER (WHERE o.ready_at IS NOT NULL AND o.ready_at <= o.expected_arrival_at)
        / count(*) FILTER (WHERE o.ready_at IS NOT NULL),
        0
      )
    END,
    (
      SELECT round(
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM (o2.ready_at - o2.accepted_at)) / 60
        )::numeric,
        0
      )
      FROM o o2
      WHERE o2.ready_at IS NOT NULL AND o2.accepted_at IS NOT NULL
    ),
    r.rating,
    r.rating_count
  FROM o
  RIGHT JOIN public.restaurants r ON r.id = _restaurant_id
  GROUP BY r.rating, r.rating_count;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_summary(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_summary(UUID, INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Takings per day, for the trend line. Gaps are filled with zeroes so a quiet
-- day reads as a dip rather than vanishing and distorting the shape.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_daily(_restaurant_id UUID, _days INT DEFAULT 14)
RETURNS TABLE (day DATE, orders BIGINT, takings NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  span INT := LEAST(GREATEST(COALESCE(_days, 14), 1), 90);
BEGIN
  PERFORM public.assert_owns_restaurant(_restaurant_id);

  RETURN QUERY
  SELECT
    d::date,
    count(o.id)::bigint,
    COALESCE(sum(o.total) FILTER (WHERE o.status = 'completed'), 0)::numeric
  FROM generate_series(
         (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date - (span - 1),
         (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
         '1 day'
       ) d
  LEFT JOIN public.orders o
    ON o.restaurant_id = _restaurant_id
   AND (o.created_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = d::date
  GROUP BY d
  ORDER BY d;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_daily(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_daily(UUID, INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Best sellers. Reads the order_items snapshots, not the live menu, so a dish
-- that has since been renamed or deleted still shows what it actually sold.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_top_dishes(
  _restaurant_id UUID,
  _days INT DEFAULT 30,
  _limit INT DEFAULT 10
)
RETURNS TABLE (name TEXT, qty BIGINT, takings NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  since TIMESTAMPTZ := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
BEGIN
  PERFORM public.assert_owns_restaurant(_restaurant_id);

  RETURN QUERY
  SELECT oi.name, sum(oi.qty)::bigint, sum(oi.line_total)::numeric
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.restaurant_id = _restaurant_id
    AND o.created_at >= since
    AND o.status = 'completed'
  GROUP BY oi.name
  ORDER BY sum(oi.qty) DESC, oi.name ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_top_dishes(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_top_dishes(UUID, INT, INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Busiest hours, in local time — what a kitchen actually staffs against.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_busiest_hours(_restaurant_id UUID, _days INT DEFAULT 30)
RETURNS TABLE (hour INT, orders BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  since TIMESTAMPTZ := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
BEGIN
  PERFORM public.assert_owns_restaurant(_restaurant_id);

  RETURN QUERY
  SELECT
    h::int,
    count(o.id)::bigint
  FROM generate_series(0, 23) h
  LEFT JOIN public.orders o
    ON o.restaurant_id = _restaurant_id
   AND o.created_at >= since
   AND extract(hour FROM (o.expected_arrival_at AT TIME ZONE 'Africa/Dar_es_Salaam')) = h
  GROUP BY h
  ORDER BY h;
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_busiest_hours(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_busiest_hours(UUID, INT) TO authenticated;
