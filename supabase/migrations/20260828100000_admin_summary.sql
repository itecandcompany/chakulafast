-- ===========================================================================
-- ChakulaFast — platform summary for the admin console.
--
-- Replaces ten separate round trips, two of which pulled *every*
-- registration_payments.amount and *every* orders.total into the browser just
-- to add them up. That is unbounded by construction: it gets slower with every
-- order the platform ever takes, and on a phone it eventually just fails.
--
-- Counting belongs in the database. One row, one request.
--
-- SECURITY DEFINER, so the admin check has to live inside the function —
-- bypassing RLS is the point, and without the gate any signed-in user could
-- read the platform's revenue.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.admin_summary()
RETURNS TABLE (
  total_users BIGINT,
  total_restaurants BIGINT,
  active_restaurants BIGINT,
  awaiting_payment BIGINT,
  payments_to_verify BIGINT,
  total_orders BIGINT,
  live_orders BIGINT,
  completed_orders BIGINT,
  -- What the platform actually earns: confirmed registration fees.
  fee_revenue NUMERIC,
  -- What customers spent on food. Paid to restaurants, not to us — kept
  -- separate so the two can never be mistaken for one another.
  order_volume NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized to view platform statistics';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.restaurants),
    (SELECT count(*) FROM public.restaurants WHERE status = 'active'),
    (SELECT count(*) FROM public.restaurants WHERE status = 'pending_payment'),
    (SELECT count(*) FROM public.registration_payments WHERE status = 'submitted'),
    (SELECT count(*) FROM public.orders),
    (SELECT count(*) FROM public.orders
      WHERE status IN ('pending', 'accepted', 'preparing', 'ready')),
    (SELECT count(*) FROM public.orders WHERE status = 'completed'),
    (SELECT COALESCE(sum(amount), 0)::numeric FROM public.registration_payments
      WHERE status = 'confirmed'),
    (SELECT COALESCE(sum(total), 0)::numeric FROM public.orders
      WHERE status = 'completed');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_summary() TO authenticated;
