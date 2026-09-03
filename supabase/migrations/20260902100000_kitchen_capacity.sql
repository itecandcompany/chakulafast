-- ChakulaFast — kitchen capacity and automatic pre-order throttling.
--
-- Until now the kitchen's only defence against a rush was
-- restaurants.is_accepting_orders: a manual, all-or-nothing kill switch. Two
-- things are wrong with that as the whole answer. A cook in the middle of a
-- rush is exactly the person who will never remember to flip it, and flipping
-- it turns away *every* order rather than the few that don't fit. So in
-- practice the kitchen absorbs the rush and the food comes out late — which is
-- the one failure this product exists to prevent.
--
-- Commercial kitchen display systems solve this with order throttling: the
-- kitchen declares how much it can cook at once, and the ordering channel
-- quotes a later slot instead of piling more onto a full line. This migration
-- adds that, in the terms this schema already thinks in.
--
-- The unit of contention is the *cooking window*. An order occupies the
-- kitchen from (expected_arrival_at - prep_minutes) until expected_arrival_at,
-- because that is precisely the stretch during which the food has to be on a
-- burner for it to be hot when the customer walks in. Two orders contend when
-- their windows overlap. Capacity is how many may overlap at once.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS kitchen_capacity INT NOT NULL DEFAULT 0
    CHECK (kitchen_capacity BETWEEN 0 AND 500);

COMMENT ON COLUMN public.restaurants.kitchen_capacity IS
  'How many orders may be cooking at the same time before pre-orders are pushed '
  'to a later slot. 0 means unlimited: this is opt-in, so existing restaurants '
  'behave exactly as they did before the vendor sets a number.';

-- The window is needed in three places below, so derive it once. NULLIF guards
-- the gap between INSERT and recalc_order_totals(): a brand-new order has
-- prep_minutes = 0 until its line items land, and a zero-width window would
-- make a real order look like it costs the kitchen nothing.
CREATE OR REPLACE FUNCTION public.order_cook_start(
  _arrival TIMESTAMPTZ,
  _prep_minutes INT,
  _fallback_minutes INT
)
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE AS $$
  SELECT _arrival - make_interval(mins => COALESCE(NULLIF(_prep_minutes, 0), _fallback_minutes));
$$;

-- How many live orders are already cooking during [_start, _end).
--
-- Half-open on purpose: an order that finishes exactly as another starts is
-- not competing for the same burner, and treating it as a conflict would cost
-- the restaurant a sale for no operational reason.
CREATE OR REPLACE FUNCTION public.kitchen_load(
  _restaurant UUID,
  _start TIMESTAMPTZ,
  _end TIMESTAMPTZ
)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::INT
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.restaurant_id = _restaurant
    -- Cancelled and completed orders have released the kitchen.
    AND o.status IN ('pending', 'accepted', 'preparing', 'ready')
    AND o.expected_arrival_at > _start
    AND public.order_cook_start(o.expected_arrival_at, o.prep_minutes, r.avg_prep_minutes) < _end;
$$;

-- Counting other people's orders is why this is SECURITY DEFINER, and also
-- why no client role may call it directly. The public entry point below
-- returns only what a customer needs to choose a time.
REVOKE ALL ON FUNCTION public.kitchen_load(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- The earliest arrival time at or after _desired whose cooking window fits.
--
-- Walks forward in 5-minute steps: finer resolution than the arrival picker
-- offers, and a hard stop at 4 hours so a badly misconfigured capacity can
-- never turn this into an unbounded loop.
CREATE OR REPLACE FUNCTION public.next_kitchen_slot(
  _restaurant UUID,
  _prep_minutes INT,
  _desired TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap INT;
  avg_prep INT;
  width INT;
  candidate TIMESTAMPTZ := _desired;
  horizon TIMESTAMPTZ := _desired + interval '4 hours';
BEGIN
  SELECT kitchen_capacity, avg_prep_minutes INTO cap, avg_prep
  FROM public.restaurants WHERE id = _restaurant;

  IF cap IS NULL OR cap <= 0 THEN
    RETURN _desired;
  END IF;

  width := COALESCE(NULLIF(_prep_minutes, 0), avg_prep);

  WHILE candidate <= horizon LOOP
    IF public.kitchen_load(
         _restaurant,
         candidate - make_interval(mins => width),
         candidate
       ) < cap THEN
      RETURN candidate;
    END IF;
    candidate := candidate + interval '5 minutes';
  END LOOP;

  -- Genuinely full for the next four hours. Returning NULL rather than a
  -- fictional slot lets the caller say "not today" honestly.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.next_kitchen_slot(UUID, INT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_kitchen_slot(UUID, INT, TIMESTAMPTZ) TO authenticated;

-- What the checkout screen asks before letting someone commit to a time.
--
-- Deliberately returns the answer in *minutes from now*, the same unit the
-- customer picked, so the UI never has to do timezone arithmetic to say
-- "they're full at 13:00, earliest is 13:20".
CREATE OR REPLACE FUNCTION public.check_kitchen_slot(
  _restaurant UUID,
  _prep_minutes INT,
  _arrival_minutes INT
)
RETURNS TABLE (
  available BOOLEAN,
  capacity INT,
  busy INT,
  suggested_minutes INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap INT;
  avg_prep INT;
  width INT;
  desired TIMESTAMPTZ := now() + make_interval(mins => _arrival_minutes);
  slot TIMESTAMPTZ;
  load INT;
BEGIN
  SELECT kitchen_capacity, avg_prep_minutes INTO cap, avg_prep
  FROM public.restaurants WHERE id = _restaurant;

  IF cap IS NULL OR cap <= 0 THEN
    RETURN QUERY SELECT true, 0, 0, _arrival_minutes;
    RETURN;
  END IF;

  width := COALESCE(NULLIF(_prep_minutes, 0), avg_prep);
  load := public.kitchen_load(_restaurant, desired - make_interval(mins => width), desired);

  IF load < cap THEN
    RETURN QUERY SELECT true, cap, load, _arrival_minutes;
    RETURN;
  END IF;

  slot := public.next_kitchen_slot(_restaurant, width, desired);

  RETURN QUERY SELECT
    false,
    cap,
    load,
    CASE
      WHEN slot IS NULL THEN NULL
      -- Round up: quoting a minute early is how food ends up waiting.
      ELSE CEIL(EXTRACT(EPOCH FROM (slot - now())) / 60.0)::INT
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_kitchen_slot(UUID, INT, INT) TO anon, authenticated;

-- Enforcement.
--
-- check_kitchen_slot() is an advisory the checkout screen uses to offer a
-- better time; this is the rule. Without it, two customers loading the last
-- slot at once would both be told yes, and the kitchen would inherit the
-- conflict. The check runs inside the INSERT, so the second one loses.
CREATE OR REPLACE FUNCTION public.enforce_kitchen_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap INT;
  avg_prep INT;
  load INT;
BEGIN
  SELECT kitchen_capacity, avg_prep_minutes INTO cap, avg_prep
  FROM public.restaurants WHERE id = NEW.restaurant_id;

  IF cap IS NULL OR cap <= 0 THEN
    RETURN NEW;
  END IF;

  -- prepare_order() has already zeroed prep_minutes and the basket has not
  -- landed yet, so the restaurant's own average is the only width available
  -- at this instant. It is the right approximation: capacity is about how
  -- many meals must be hot at once, not about this basket's exact timing.
  load := public.kitchen_load(
    NEW.restaurant_id,
    NEW.expected_arrival_at - make_interval(mins => avg_prep),
    NEW.expected_arrival_at
  );

  IF load >= cap THEN
    RAISE EXCEPTION 'KITCHEN_FULL'
      USING HINT = 'The kitchen is fully booked for that arrival time.',
            ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER prepare_order in name order, which matters: expected_arrival_at is
-- derived there, and this trigger reads it.
CREATE TRIGGER trg_zz_enforce_kitchen_capacity
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kitchen_capacity();

-- kitchen_load() filters on these three columns on every checkout.
CREATE INDEX IF NOT EXISTS orders_kitchen_load_idx
  ON public.orders (restaurant_id, expected_arrival_at)
  WHERE status IN ('pending', 'accepted', 'preparing', 'ready');
