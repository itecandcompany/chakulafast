-- ===========================================================================
-- ChakulaFast — integrity guards.
--
-- RLS answers "may this user touch this row at all?". These triggers answer
-- the narrower question "may they change *this column*, to *this value*,
-- right now?" — which is what actually keeps a customer from zeroing their
-- bill or a vendor from marking their own listing active without paying.
--
-- Two escape hatches, used consistently below:
--   pg_trigger_depth() > 1 → the write came from another trigger of ours
--                            (totals recalc, rating rollup, activation),
--                            which has already been vetted.
--   auth.uid() IS NULL     → no JWT, i.e. the service role: server functions,
--                            seed scripts and gateway webhooks.
--
-- Every RAISE EXCEPTION message here is written to be shown to a user
-- verbatim; src/lib/errorMessages.ts allow-lists them by prefix.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles: nobody promotes themselves
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot change role directly';
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    RAISE EXCEPTION 'Cannot change account status directly';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- user_roles is the source of truth; profiles.role is the copy the UI reads.
-- Keeping them in sync here means an admin action only has to write one table
-- and the two can never drift.
CREATE OR REPLACE FUNCTION public.sync_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target UUID := COALESCE(NEW.user_id, OLD.user_id);
  effective app_role;
BEGIN
  -- Highest privilege wins if a user somehow holds more than one role.
  SELECT role INTO effective
  FROM public.user_roles
  WHERE user_id = target
  ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'restaurant' THEN 1 ELSE 2 END
  LIMIT 1;

  UPDATE public.profiles
     SET role = COALESCE(effective, 'customer')
   WHERE id = target;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_profile_role
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role();

-- ---------------------------------------------------------------------------
-- restaurants: a vendor cannot publish or re-rate itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_restaurant_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Cannot transfer a restaurant to another owner';
  END IF;

  -- This is the load-bearing check for the whole business model: the only
  -- path from 'pending_payment' to 'active' is a confirmed payment.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Listing status is set by the platform, not by the restaurant';
  END IF;

  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.rating_count IS DISTINCT FROM OLD.rating_count THEN
    RAISE EXCEPTION 'Ratings are calculated from customer reviews';
  END IF;

  -- The slug is a public URL that customers may have bookmarked or shared.
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Cannot change the restaurant web address once it is set';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_restaurant_update
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_update();

-- ---------------------------------------------------------------------------
-- orders: the status pipeline
--
--   pending ──▶ accepted ──▶ preparing ──▶ ready ──▶ completed
--      │            │            │           │
--      └────────────┴────────────┴───────────┴──▶ cancelled
--
-- The customer may cancel only before cooking starts. The kitchen drives
-- every other transition, one step at a time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  is_customer BOOLEAN;
  is_vendor BOOLEAN;
BEGIN
  IF pg_trigger_depth() > 1 OR uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;

  is_customer := uid = OLD.customer_id;
  is_vendor := EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = OLD.restaurant_id AND r.owner_id = uid
  );

  IF NOT (is_customer OR is_vendor) THEN
    RAISE EXCEPTION 'Not authorized to update this order';
  END IF;

  -- Identity and money are fixed once the order exists.
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.prep_minutes IS DISTINCT FROM OLD.prep_minutes
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Order details cannot be changed after it is placed';
  END IF;

  IF is_customer THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted')) THEN
      RAISE EXCEPTION 'Order can only be cancelled before the kitchen starts cooking';
    END IF;
  ELSE
    -- Vendor: one step at a time, forwards, or cancel with a reason.
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'pending'   AND NEW.status IN ('accepted', 'cancelled'))
      OR (OLD.status = 'accepted'  AND NEW.status IN ('preparing', 'cancelled'))
      OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled'))
      OR (OLD.status = 'ready'     AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Order status cannot move from % to %', OLD.status, NEW.status;
    END IF;

    -- When the customer will arrive is the customer's call, not the kitchen's.
    IF NEW.arrival_mode IS DISTINCT FROM OLD.arrival_mode
       OR NEW.arrival_minutes IS DISTINCT FROM OLD.arrival_minutes
       OR NEW.expected_arrival_at IS DISTINCT FROM OLD.expected_arrival_at
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone THEN
      RAISE EXCEPTION 'The kitchen cannot change the customer arrival details';
    END IF;
  END IF;

  -- Pipeline timestamps are stamped here and only here, so they always
  -- reflect when the transition really happened.
  NEW.accepted_at  := COALESCE(OLD.accepted_at,  CASE WHEN NEW.status = 'accepted'  THEN now() END);
  NEW.preparing_at := COALESCE(OLD.preparing_at, CASE WHEN NEW.status = 'preparing' THEN now() END);
  NEW.ready_at     := COALESCE(OLD.ready_at,     CASE WHEN NEW.status = 'ready'     THEN now() END);
  NEW.completed_at := COALESCE(OLD.completed_at, CASE WHEN NEW.status = 'completed' THEN now() END);
  NEW.cancelled_at := COALESCE(OLD.cancelled_at, CASE WHEN NEW.status = 'cancelled' THEN now() END);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_order_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();

-- ---------------------------------------------------------------------------
-- order_events: written only from here, so the history cannot be forged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.order_events (order_id, status, actor_id, note)
  VALUES (
    NEW.id,
    NEW.status,
    auth.uid(),
    CASE WHEN NEW.status = 'cancelled' THEN NEW.cancel_reason END
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_order_event
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_event();
