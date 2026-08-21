-- ===========================================================================
-- ChakulaFast — order line integrity + the admin console's write access.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Prices come from the menu, never from the request body.
--
-- Without this, a customer could POST an order line with unit_price = 1 and
-- the totals trigger would faithfully compute a 1 TSh bill. Overwriting the
-- snapshot columns from the live menu row closes that off at the database,
-- so it holds no matter which client is talking to it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mi RECORD;
  ord RECORD;
BEGIN
  SELECT restaurant_id, status INTO ord FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That order no longer exists';
  END IF;

  IF NEW.menu_item_id IS NULL THEN
    RAISE EXCEPTION 'Every order line must reference a dish on the menu';
  END IF;

  SELECT id, restaurant_id, name, price, prep_minutes, is_available
    INTO mi
  FROM public.menu_items
  WHERE id = NEW.menu_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That dish is no longer on the menu';
  END IF;

  IF mi.restaurant_id <> ord.restaurant_id THEN
    RAISE EXCEPTION 'An order cannot mix dishes from different restaurants';
  END IF;

  IF NOT mi.is_available THEN
    RAISE EXCEPTION 'That dish is out of stock right now';
  END IF;

  NEW.name := mi.name;
  NEW.unit_price := mi.price;
  NEW.prep_minutes := mi.prep_minutes;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_order_item
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.prepare_order_item();

-- ---------------------------------------------------------------------------
-- Whoever confirms a payment is recorded automatically, so the audit trail
-- can't be attributed to somebody else.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_payment_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
    NEW.confirmed_by := COALESCE(auth.uid(), NEW.confirmed_by);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stamp_payment_confirmation
  BEFORE UPDATE ON public.registration_payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_payment_confirmation();

-- ---------------------------------------------------------------------------
-- Admin write access.
--
-- Reads were granted in the earlier migrations; these are the writes the
-- admin console needs: approve/suspend a listing, correct a profile, and
-- step into a stuck order. Every one is gated on has_role(admin), and the
-- guard triggers already let admins through.
-- ---------------------------------------------------------------------------
CREATE POLICY "Admins update restaurants" ON public.restaurants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage menus" ON public.menu_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Deliberately no DELETE policy on restaurants for anyone, including admins:
-- orders reference them ON DELETE RESTRICT, so a listing with history can
-- only be suspended. The one case where deletion is safe (a listing that
-- never took an order) is handled by adminDeleteRestaurant in
-- src/lib/adminRestaurants.functions.ts, which checks first and explains
-- itself if it can't.
