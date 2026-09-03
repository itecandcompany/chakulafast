-- ChakulaFast — automatic activation when a payment reference reconciles.
--
-- Today every registration waits on a human opening /admin/payments and
-- ticking it off. That is a person standing between a restaurant that has
-- already paid and a listing that earns them money, at whatever hour they
-- happened to pay.
--
-- The dangerous way to automate this is to accept any reference that *looks*
-- like an M-Pesa transaction ID. That is not matching, it is guessing: anyone
-- who can type ten plausible characters gets a free listing. So matching here
-- means matching against money the platform has actually observed arriving.
--
-- received_payments is that ledger. The operator pastes in their mobile-money
-- statement (or, later, an SMS forwarder or provider webhook writes to it),
-- and a vendor's reference is only honoured when it lines up with an unclaimed
-- row worth at least the registration fee. No ledger entry, no activation —
-- the payment simply waits for a human, exactly as it does now.

CREATE TABLE public.received_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL CHECK (length(btrim(reference)) BETWEEN 4 AND 64),

  -- References get retyped off a phone screen, so "QER 4T5-Y7U" and
  -- "qer4t5y7u" have to be the same key. Comparing on this rather than on
  -- `reference` is what makes the match survive a human transcribing it.
  reference_key TEXT GENERATED ALWAYS AS (
    upper(regexp_replace(reference, '[^A-Za-z0-9]', '', 'g'))
  ) STORED,

  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'TZS',
  -- Phone the money came from, copied onto the registration on match.
  msisdn TEXT,
  paid_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'sms', 'webhook')),

  -- Set the moment this money is spent on a registration. A ledger entry pays
  -- for exactly one listing.
  claimed_by UUID REFERENCES public.registration_payments ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,

  recorded_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ledger row per real-world transaction. Also stops an operator
-- double-pasting the same statement line into two rows, which would otherwise
-- let one payment activate two restaurants.
CREATE UNIQUE INDEX received_payments_reference_key_idx
  ON public.received_payments (reference_key);

CREATE INDEX received_payments_unclaimed_idx
  ON public.received_payments (created_at DESC)
  WHERE claimed_by IS NULL;

COMMENT ON TABLE public.received_payments IS
  'Money the platform has actually observed arriving. A registration reference '
  'is only auto-confirmed when it matches an unclaimed row here.';

-- ---------------------------------------------------------------------------
-- The matcher
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_payment_reference(_reference TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(COALESCE(_reference, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.match_registration_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  key TEXT;
  fee NUMERIC;
  hit public.received_payments%ROWTYPE;
  claimed INT;
BEGIN
  -- Only an open attempt with something to match on. Re-entry after the
  -- UPDATE below lands here with status = 'confirmed' and stops.
  IF NEW.status NOT IN ('pending', 'submitted') THEN
    RETURN NULL;
  END IF;

  key := public.normalize_payment_reference(NEW.reference);

  -- A short string is a typo or a probe, not a transaction ID. Refusing to
  -- match on one keeps a two-character entry from sweeping the ledger.
  IF length(key) < 6 THEN
    RETURN NULL;
  END IF;

  fee := public.registration_fee_tzs();

  -- FOR UPDATE so two registrations racing on the same reference serialise
  -- here rather than both reading it as unclaimed.
  SELECT * INTO hit
  FROM public.received_payments
  WHERE reference_key = key
    AND claimed_by IS NULL
    AND amount >= fee
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.received_payments
     SET claimed_by = NEW.id,
         claimed_at = now()
   WHERE id = hit.id
     AND claimed_by IS NULL;

  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed = 0 THEN
    -- Lost the race. Leave the registration for a human rather than
    -- confirming it against money someone else just spent.
    RETURN NULL;
  END IF;

  -- This UPDATE is what activates the listing: it fires
  -- stamp_payment_confirmation() and then activate_restaurant_on_payment().
  -- Doing it here rather than in a BEFORE trigger is deliberate — RLS checks
  -- the *final* row, and "Owner submits own payment" only permits
  -- pending/submitted, so a BEFORE trigger setting 'confirmed' would make the
  -- vendor's own insert fail.
  UPDATE public.registration_payments
     SET status = 'confirmed',
         msisdn = COALESCE(msisdn, hit.msisdn),
         note = COALESCE(
           note,
           'Auto-confirmed: reference matched a received payment of '
             || hit.amount || ' ' || hit.currency
         )
   WHERE id = NEW.id
     AND status IN ('pending', 'submitted');

  RETURN NULL;
END;
$$;

-- AFTER, and on the reference too: a vendor who mistypes and corrects it gets
-- a second attempt without an admin touching anything.
CREATE TRIGGER trg_match_registration_payment
  AFTER INSERT OR UPDATE OF reference, status ON public.registration_payments
  FOR EACH ROW EXECUTE FUNCTION public.match_registration_payment();

-- ---------------------------------------------------------------------------
-- Letting a vendor correct their own reference
--
-- Without this the vendor's only route is INSERT, so every corrected typo
-- leaves another abandoned row, and the matcher gets one attempt per vendor
-- rather than one per correction.
-- ---------------------------------------------------------------------------

CREATE POLICY "Owner corrects own open payment" ON public.registration_payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = registration_payments.restaurant_id AND r.owner_id = auth.uid()
    )
    AND status IN ('pending', 'submitted')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = registration_payments.restaurant_id AND r.owner_id = auth.uid()
    )
    AND status IN ('pending', 'submitted')
  );

-- The policy above says *which rows* a vendor may touch. This says which
-- columns, and it is the load-bearing half: the amount is the fee, and a
-- vendor must never be able to move their own payment to confirmed.
CREATE OR REPLACE FUNCTION public.guard_payment_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  -- The matcher and the admin console both reach this at depth > 1 or with no
  -- end-user JWT; neither is what this guard is for.
  IF pg_trigger_depth() > 1 OR uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(uid, 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by THEN
    RAISE EXCEPTION 'Only the payment reference and method can be corrected';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_payment_update
  BEFORE UPDATE ON public.registration_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_update();

-- ---------------------------------------------------------------------------
-- RLS on the ledger
--
-- Admins only, and that includes SELECT. A vendor who could read this table
-- would see unclaimed references — which is precisely the secret that makes
-- the whole mechanism safe.
-- ---------------------------------------------------------------------------
ALTER TABLE public.received_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read received payments" ON public.received_payments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record received payments" ON public.received_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins correct received payments" ON public.received_payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete received payments" ON public.received_payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Stamp who recorded it, so a disputed activation can be traced back to the
-- statement line and the person who entered it.
CREATE OR REPLACE FUNCTION public.prepare_received_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.recorded_by := COALESCE(NEW.recorded_by, auth.uid());
  NEW.paid_at := COALESCE(NEW.paid_at, now());
  -- Claiming is the matcher's job alone.
  NEW.claimed_by := NULL;
  NEW.claimed_at := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_received_payment
  BEFORE INSERT ON public.received_payments
  FOR EACH ROW EXECUTE FUNCTION public.prepare_received_payment();
