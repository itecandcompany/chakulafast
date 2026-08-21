-- ===========================================================================
-- ChakulaFast — menus, pre-orders, order history and live arrival pings.
--
-- The pre-order ("ready on arrival") flow lives here:
--   orders.expected_arrival_at  — when the customer says they'll walk in
--   orders.prep_minutes         — longest prep time in the basket, snapshotted
--   → the vendor board renders "start cooking at" = arrival − prep, so the
--     food lands on the counter as the customer does.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Menu items
-- ---------------------------------------------------------------------------
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  category menu_category NOT NULL DEFAULT 'local',
  photo_url TEXT,
  prep_minutes INT NOT NULL DEFAULT 15 CHECK (prep_minutes BETWEEN 1 AND 240),
  is_available BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  -- Denormalised so the search only ever touches one indexed column.
  search_text TEXT GENERATED ALWAYS AS (
    lower(name || ' ' || coalesce(description, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX menu_items_restaurant_idx ON public.menu_items (restaurant_id, sort_order);
CREATE INDEX menu_items_category_idx ON public.menu_items (category) WHERE is_available;

DO $$
BEGIN
  CREATE INDEX menu_items_search_trgm_idx
    ON public.menu_items USING gin (search_text extensions.gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping trigram index on menu_items (%)', SQLERRM;
END $$;

CREATE TRIGGER trg_menu_items_touch
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short, sayable code — what the customer reads out at the counter.
  code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a restaurant with order history can be suspended
  -- but must never take its financial record with it when deleted.
  restaurant_id UUID NOT NULL REFERENCES public.restaurants ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending',
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  note TEXT,
  customer_phone TEXT,
  customer_lat DOUBLE PRECISION,
  customer_lng DOUBLE PRECISION,
  -- 'manual' = the customer picked "I'll be there in N minutes".
  -- 'gps'    = estimated from their live position and refreshed by pings.
  arrival_mode TEXT NOT NULL DEFAULT 'manual' CHECK (arrival_mode IN ('manual', 'gps')),
  arrival_minutes INT NOT NULL DEFAULT 15 CHECK (arrival_minutes BETWEEN 0 AND 240),
  expected_arrival_at TIMESTAMPTZ NOT NULL,
  -- Snapshot of the slowest dish in the basket, so the "start cooking at"
  -- countdown stays correct even if the vendor later edits the menu.
  prep_minutes INT NOT NULL DEFAULT 0,
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_restaurant_idx ON public.orders (restaurant_id, status, created_at DESC);
CREATE INDEX orders_customer_idx ON public.orders (customer_id, created_at DESC);
CREATE INDEX orders_live_idx ON public.orders (expected_arrival_at)
  WHERE status IN ('pending', 'accepted', 'preparing', 'ready');

CREATE TRIGGER trg_orders_touch
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders ON DELETE CASCADE,
  -- SET NULL rather than cascade: deleting a dish from the menu must not
  -- erase what somebody actually bought. The name/price snapshots below are
  -- what the receipt renders from.
  menu_item_id UUID REFERENCES public.menu_items ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  prep_minutes INT NOT NULL DEFAULT 15,
  qty INT NOT NULL CHECK (qty BETWEEN 1 AND 50),
  line_total NUMERIC(10, 2) GENERATED ALWAYS AS (unit_price * qty) STORED
);

CREATE INDEX order_items_order_idx ON public.order_items (order_id);

-- Append-only status history. Powers the customer's tracker and gives admins
-- something to read when a vendor and a customer disagree about what happened.
CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders ON DELETE CASCADE,
  status order_status NOT NULL,
  actor_id UUID REFERENCES auth.users ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_events_order_idx ON public.order_events (order_id, created_at);

-- Live "I'm on my way" pings. Each one can move the arrival estimate, which
-- is what lets the kitchen re-time a dish when the customer hits traffic.
CREATE TABLE public.order_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION,
  eta_minutes INT CHECK (eta_minutes BETWEEN 0 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX order_pings_order_idx ON public.order_pings (order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Order code + derived fields
-- ---------------------------------------------------------------------------
-- Alphabet excludes 0/O/1/I so a code read aloud over a noisy counter can't
-- be mistranscribed.
CREATE OR REPLACE FUNCTION public.gen_order_code()
RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate TEXT;
  i INT;
BEGIN
  LOOP
    candidate := 'CF-';
    FOR i IN 1..5 LOOP
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_order()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.gen_order_code();
  END IF;

  -- The client sends "in N minutes"; the absolute instant is derived here so
  -- a wrong clock in the browser can't shift the kitchen's countdown.
  NEW.expected_arrival_at := now() + make_interval(mins => NEW.arrival_minutes);

  -- Every derived field starts empty no matter what the client posted.
  -- Totals and prep time are filled in by recalc_order_totals() once the
  -- line items land; the pipeline timestamps are stamped by the guard
  -- trigger as the order actually moves through the kitchen.
  NEW.subtotal := 0;
  NEW.total := 0;
  NEW.prep_minutes := 0;
  NEW.accepted_at := NULL;
  NEW.preparing_at := NULL;
  NEW.ready_at := NULL;
  NEW.completed_at := NULL;
  NEW.cancelled_at := NULL;
  NEW.cancel_reason := NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.prepare_order();

-- Totals and prep time are derived from the line items, never trusted from
-- the client. Runs on every basket mutation while the order is still open.
CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target UUID := COALESCE(NEW.order_id, OLD.order_id);
  sum_total NUMERIC(10, 2);
  max_prep INT;
BEGIN
  SELECT COALESCE(sum(line_total), 0), COALESCE(max(prep_minutes), 0)
    INTO sum_total, max_prep
  FROM public.order_items
  WHERE order_id = target;

  UPDATE public.orders
     SET subtotal = sum_total,
         -- No platform commission on orders: ChakulaFast monetises through
         -- the one-time restaurant registration fee, so total = subtotal.
         -- Keeping both columns leaves room for fees/discounts later.
         total = sum_total,
         prep_minutes = max_prep
   WHERE id = target;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalc_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

-- A ping refreshes the arrival estimate, but only for GPS-tracked orders —
-- if the customer explicitly said "15 minutes", that's their commitment and
-- a stray location reading shouldn't override it.
CREATE OR REPLACE FUNCTION public.apply_order_ping()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.eta_minutes IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.orders
     SET expected_arrival_at = now() + make_interval(mins => NEW.eta_minutes),
         customer_lat = NEW.lat,
         customer_lng = NEW.lng
   WHERE id = NEW.order_id
     AND arrival_mode = 'gps'
     AND status IN ('pending', 'accepted', 'preparing', 'ready');

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_apply_order_ping
  AFTER INSERT ON public.order_pings
  FOR EACH ROW EXECUTE FUNCTION public.apply_order_ping();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_pings ENABLE ROW LEVEL SECURITY;

-- menu_items ----------------------------------------------------------------
CREATE POLICY "Anyone can view menus of active restaurants" ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = menu_items.restaurant_id AND r.status = 'active'
    )
  );

CREATE POLICY "Owner manages own menu" ON public.menu_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins view all menus" ON public.menu_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- orders --------------------------------------------------------------------
CREATE POLICY "Customer views own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = customer_id);

CREATE POLICY "Restaurant views its orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only a signed-in customer can create an order, only for themselves, only
-- at an active restaurant that is currently accepting them.
CREATE POLICY "Customer places own order" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = orders.restaurant_id
        AND r.status = 'active'
        AND r.is_accepting_orders
    )
  );

-- The row-level rule is "a participant may update"; *what* they may change is
-- narrowed further by guard_order_update() in the guards migration.
CREATE POLICY "Participants update order" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = customer_id
    OR EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- order_items ---------------------------------------------------------------
CREATE POLICY "Participants view order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      LEFT JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_items.order_id
        AND (o.customer_id = auth.uid() OR r.owner_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Lines can only be added while the order is still untouched by the kitchen.
CREATE POLICY "Customer fills own basket" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.customer_id = auth.uid()
        AND o.status = 'pending'
    )
  );

CREATE POLICY "Customer removes own basket lines" ON public.order_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.customer_id = auth.uid()
        AND o.status = 'pending'
    )
  );

-- order_events --------------------------------------------------------------
CREATE POLICY "Participants view order events" ON public.order_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      LEFT JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_events.order_id
        AND (o.customer_id = auth.uid() OR r.owner_id = auth.uid())
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Deliberately no INSERT policy — the log is written only by the
-- SECURITY DEFINER trigger, so it can't be forged.

-- order_pings ---------------------------------------------------------------
CREATE POLICY "Participants view pings" ON public.order_pings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      LEFT JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_pings.order_id
        AND (o.customer_id = auth.uid() OR r.owner_id = auth.uid())
    )
  );

CREATE POLICY "Customer pings own live order" ON public.order_pings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_pings.order_id
        AND o.customer_id = auth.uid()
        AND o.status IN ('pending', 'accepted', 'preparing', 'ready')
    )
  );
