-- ===========================================================================
-- ChakulaFast — the one-time restaurant registration fee (5,000 TZS).
--
-- Flow while PAYMENT_PROVIDER=manual:
--   1. Restaurant signs up and creates its listing  → status 'pending_payment'
--   2. Restaurant pays by mobile money and records the transaction reference
--      → registration_payments row, status 'submitted'
--   3. Admin verifies the reference and marks it received
--      → status 'confirmed' → activate_restaurant_on_payment() flips the
--        restaurant to 'active' and its menu becomes visible to customers
--
-- When a real gateway is wired up, step 3 is driven by the provider's webhook
-- instead of a human; nothing else in the flow changes.
-- ===========================================================================

-- Single-row settings table so the platform owner can change the fee or the
-- payment instructions from the admin console instead of shipping a migration.
CREATE TABLE public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  registration_fee_tzs NUMERIC(10, 2) NOT NULL DEFAULT 5000 CHECK (registration_fee_tzs >= 0),
  currency TEXT NOT NULL DEFAULT 'TZS',
  till_number TEXT,
  payment_instructions TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, payment_instructions)
VALUES (
  true,
  'Pay the registration fee to the platform till number, then enter the transaction reference from the confirmation SMS below. An administrator will verify it and activate your listing.'
);

CREATE TRIGGER trg_platform_settings_touch
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.registration_fee_tzs()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT registration_fee_tzs FROM public.platform_settings WHERE id), 5000);
$$;

CREATE TABLE public.registration_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  method payment_method NOT NULL DEFAULT 'manual',
  -- Transaction ID from the mobile money confirmation SMS.
  reference TEXT,
  -- Phone number the payment came from, for reconciliation.
  msisdn TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  -- Raw gateway response, once there is a gateway. Never rendered to a user.
  provider_payload JSONB,
  note TEXT,
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX registration_payments_restaurant_idx
  ON public.registration_payments (restaurant_id, created_at DESC);
CREATE INDEX registration_payments_status_idx
  ON public.registration_payments (status, created_at DESC);

-- A restaurant pays once. Failed and pending attempts may pile up; exactly one
-- of them is ever allowed to reach 'confirmed'.
CREATE UNIQUE INDEX registration_payments_one_confirmed_idx
  ON public.registration_payments (restaurant_id)
  WHERE status = 'confirmed';

CREATE TRIGGER trg_registration_payments_touch
  BEFORE UPDATE ON public.registration_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- The amount is set from platform_settings, never from the request body —
-- otherwise a restaurant could submit a 1 TZS payment and get activated.
CREATE OR REPLACE FUNCTION public.prepare_registration_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.amount := public.registration_fee_tzs();
  NEW.currency := COALESCE(
    (SELECT currency FROM public.platform_settings WHERE id),
    'TZS'
  );

  -- Only an admin (or a gateway webhook running as the service role) may
  -- create an already-confirmed payment.
  IF NEW.status = 'confirmed' AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'A payment cannot be created as already confirmed';
  END IF;

  IF NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_registration_payment
  BEFORE INSERT ON public.registration_payments
  FOR EACH ROW EXECUTE FUNCTION public.prepare_registration_payment();

-- Confirming a payment is the single event that puts a restaurant live.
CREATE OR REPLACE FUNCTION public.activate_restaurant_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    -- confirmed_at / confirmed_by are stamped by stamp_payment_confirmation()
    -- (a BEFORE UPDATE trigger added in a later migration), so this only has
    -- the listing to deal with.
    --
    -- Only lifts a listing that is waiting on payment. A suspended or
    -- rejected restaurant stays where the admin put it — money alone
    -- shouldn't undo a moderation decision.
    UPDATE public.restaurants
       SET status = 'active'
     WHERE id = NEW.restaurant_id
       AND status = 'pending_payment';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_activate_restaurant_on_payment
  AFTER UPDATE ON public.registration_payments
  FOR EACH ROW EXECUTE FUNCTION public.activate_restaurant_on_payment();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_payments ENABLE ROW LEVEL SECURITY;

-- Vendors need to read the fee and the payment instructions.
CREATE POLICY "Signed-in users read platform settings" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins update platform settings" ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner views own payments" ON public.registration_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = registration_payments.restaurant_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins view all payments" ON public.registration_payments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner submits own payment" ON public.registration_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = registration_payments.restaurant_id AND r.owner_id = auth.uid()
    )
    AND status IN ('pending', 'submitted')
  );

-- Confirming is an admin action only. Vendors cannot mark their own payment
-- received, and cannot edit a reference after submitting it.
CREATE POLICY "Admins update payments" ON public.registration_payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
