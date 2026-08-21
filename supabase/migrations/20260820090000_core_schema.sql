-- ===========================================================================
-- ChakulaFast — core schema: roles, profiles, restaurants, opening hours.
--
-- Security model (same shape as the reference project):
--   * `user_roles` is the source of truth for authorisation. `profiles.role`
--     is a denormalised copy used only to render UI, and is kept in sync by
--     triggers. Nothing may grant itself a role — see handle_new_user().
--   * Every table has RLS on. Public/guest browsing is deliberate and narrow:
--     anon may read ACTIVE restaurants and their menus, nothing else.
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

-- Trigram index backs the dish search ("ugali", "chip", …), which is a
-- leading-wildcard ILIKE and therefore unindexable any other way. Guarded so
-- the migration still applies on a Postgres where the extension isn't
-- available — search just falls back to a sequential scan.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable (%), dish search will not be index-backed', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('customer', 'restaurant', 'admin');

-- A restaurant is invisible to customers until it has paid the one-time
-- registration fee and an admin (or the payment gateway) confirms it.
CREATE TYPE public.restaurant_status AS ENUM (
  'pending_payment',
  'active',
  'suspended',
  'rejected'
);

CREATE TYPE public.order_status AS ENUM (
  'pending',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled'
);

CREATE TYPE public.payment_status AS ENUM ('pending', 'submitted', 'confirmed', 'failed');

CREATE TYPE public.payment_method AS ENUM (
  'mpesa',
  'tigopesa',
  'airtel',
  'halopesa',
  'bank',
  'cash',
  'manual'
);

CREATE TYPE public.menu_category AS ENUM (
  'local',
  'grills',
  'fast_food',
  'breakfast',
  'snacks',
  'drinks',
  'desserts'
);

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Great-circle distance in km. IMMUTABLE so it can be used in indexes and
-- inlined into the search query's ORDER BY.
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
RETURNS double precision
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  END;
$$;

-- ---------------------------------------------------------------------------
-- Profiles + roles
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  town TEXT,
  role app_role NOT NULL DEFAULT 'customer',
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- ---------------------------------------------------------------------------
-- Restaurants / hotels
-- ---------------------------------------------------------------------------
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description TEXT,
  phone TEXT,
  town TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  logo_url TEXT,
  cover_url TEXT,
  status restaurant_status NOT NULL DEFAULT 'pending_payment',
  -- Fallback prep time used for restaurant-level ETA display; individual
  -- dishes carry their own prep_minutes and win when an order is placed.
  avg_prep_minutes INT NOT NULL DEFAULT 20 CHECK (avg_prep_minutes BETWEEN 1 AND 240),
  -- Vendor's own kill switch, independent of opening hours ("kitchen is
  -- swamped, stop taking pre-orders for now").
  is_accepting_orders BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX restaurants_status_town_idx ON public.restaurants (status, town);
CREATE INDEX restaurants_slug_idx ON public.restaurants (slug);

CREATE TRIGGER trg_restaurants_touch
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 0 = Sunday, matching JavaScript's Date#getDay() so the client never has to
-- remap. A missing row for a weekday means "closed that day".
CREATE TABLE public.restaurant_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at TIME NOT NULL DEFAULT '08:00',
  closes_at TIME NOT NULL DEFAULT '22:00',
  is_closed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (restaurant_id, day_of_week)
);

CREATE INDEX restaurant_hours_restaurant_idx ON public.restaurant_hours (restaurant_id);

-- Everything user-facing is in Tanzanian local time regardless of where the
-- server or the browser thinks it is.
CREATE OR REPLACE FUNCTION public.is_restaurant_open(_restaurant_id UUID, _at TIMESTAMPTZ DEFAULT now())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  local_ts TIMESTAMP;
  h RECORD;
BEGIN
  local_ts := _at AT TIME ZONE 'Africa/Dar_es_Salaam';

  SELECT * INTO h
  FROM public.restaurant_hours
  WHERE restaurant_id = _restaurant_id
    AND day_of_week = EXTRACT(DOW FROM local_ts)::smallint;

  IF NOT FOUND OR h.is_closed THEN
    RETURN false;
  END IF;

  -- A closing time earlier than the opening time means the kitchen runs past
  -- midnight (e.g. 18:00 → 02:00), so the window wraps around the day.
  IF h.closes_at <= h.opens_at THEN
    RETURN local_ts::time >= h.opens_at OR local_ts::time < h.closes_at;
  END IF;

  RETURN local_ts::time BETWEEN h.opens_at AND h.closes_at;
END;
$$;

-- ---------------------------------------------------------------------------
-- Signup trigger: create the profile and the role row together.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role app_role;
BEGIN
  _role := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'role', '')::app_role,
    'customer'
  );

  -- Signup metadata is attacker-controlled: anyone can put role=admin in the
  -- signUp() options. Only 'customer' and 'restaurant' are self-selectable;
  -- admins are made with the service role (scripts/seed-admin.mjs).
  IF _role NOT IN ('customer', 'restaurant') THEN
    _role := 'customer';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, town, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email, 'Guest'),
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'town',
    _role
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_hours ENABLE ROW LEVEL SECURITY;

-- profiles ------------------------------------------------------------------
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT policy: handle_new_user() (SECURITY DEFINER) is the only writer.

-- user_roles ----------------------------------------------------------------
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Deliberately no INSERT/UPDATE/DELETE policies. Roles are assigned by the
-- signup trigger or by an admin through a server function using the service
-- role key, never by the user themselves.

-- restaurants ---------------------------------------------------------------
-- Guests must be able to browse, so this one policy covers anon too. Only
-- ACTIVE restaurants are exposed; a pending/suspended one is invisible to
-- everyone except its owner and admins.
CREATE POLICY "Anyone can view active restaurants" ON public.restaurants
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY "Owner views own restaurant" ON public.restaurants
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Admins view all restaurants" ON public.restaurants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Restaurant users create own listing" ON public.restaurants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    AND public.has_role(auth.uid(), 'restaurant')
    -- A brand new listing always starts unpaid; only the payment flow or an
    -- admin can move it on (see the guard trigger in the guards migration).
    AND status = 'pending_payment'
  );

CREATE POLICY "Owner updates own restaurant" ON public.restaurants
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- restaurant_hours ----------------------------------------------------------
CREATE POLICY "Anyone can view hours of active restaurants" ON public.restaurant_hours
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_hours.restaurant_id AND r.status = 'active'
    )
  );

CREATE POLICY "Owner manages own hours" ON public.restaurant_hours
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_hours.restaurant_id AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_hours.restaurant_id AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage hours" ON public.restaurant_hours
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
