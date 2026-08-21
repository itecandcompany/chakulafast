-- ===========================================================================
-- ChakulaFast — discovery.
--
-- The headline query: "I'm in Moshi and I want ugali — who has it, how much,
-- how far, and how long will it take?". One round trip returns the dish, the
-- restaurant, the distance and whether the kitchen is open right now.
--
-- Both functions are SECURITY INVOKER on purpose: RLS already restricts
-- restaurants/menu_items to status = 'active' for anon and authenticated
-- alike, so guests get exactly the same public view without any extra
-- surface area. The redundant `r.status = 'active'` predicates below let the
-- planner use restaurants_status_town_idx instead of relying on the policy.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.search_dishes(
  _q TEXT DEFAULT NULL,
  _lat DOUBLE PRECISION DEFAULT NULL,
  _lng DOUBLE PRECISION DEFAULT NULL,
  _town TEXT DEFAULT NULL,
  _category menu_category DEFAULT NULL,
  _max_km DOUBLE PRECISION DEFAULT NULL,
  _max_price NUMERIC DEFAULT NULL,
  _open_only BOOLEAN DEFAULT false,
  _available_only BOOLEAN DEFAULT true,
  _sort TEXT DEFAULT 'distance',
  _limit INT DEFAULT 60
)
RETURNS TABLE (
  item_id UUID,
  item_name TEXT,
  description TEXT,
  price NUMERIC,
  category menu_category,
  photo_url TEXT,
  prep_minutes INT,
  is_available BOOLEAN,
  restaurant_id UUID,
  restaurant_name TEXT,
  slug TEXT,
  town TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  logo_url TEXT,
  rating NUMERIC,
  rating_count INT,
  is_accepting_orders BOOLEAN,
  is_open BOOLEAN,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      mi.id            AS item_id,
      mi.name          AS item_name,
      mi.description   AS description,
      mi.price         AS price,
      mi.category      AS category,
      mi.photo_url     AS photo_url,
      mi.prep_minutes  AS prep_minutes,
      mi.is_available  AS is_available,
      r.id             AS restaurant_id,
      r.name           AS restaurant_name,
      r.slug           AS slug,
      r.town           AS town,
      r.address        AS address,
      r.lat            AS lat,
      r.lng            AS lng,
      r.logo_url       AS logo_url,
      r.rating         AS rating,
      r.rating_count   AS rating_count,
      r.is_accepting_orders AS is_accepting_orders,
      public.is_restaurant_open(r.id) AS is_open,
      public.haversine_km(_lat, _lng, r.lat, r.lng) AS distance_km
    FROM public.menu_items mi
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE r.status = 'active'
      -- Substring match, not prefix: "ugali" has to find "Ugali na maharage"
      -- and "Nyama choma na ugali" alike. Backed by the trigram index.
      AND (_q IS NULL OR btrim(_q) = '' OR mi.search_text LIKE '%' || lower(btrim(_q)) || '%')
      AND (_town IS NULL OR btrim(_town) = '' OR lower(r.town) = lower(btrim(_town)))
      AND (_category IS NULL OR mi.category = _category)
      AND (_max_price IS NULL OR mi.price <= _max_price)
      AND (NOT _available_only OR mi.is_available)
  )
  SELECT
    b.item_id, b.item_name, b.description, b.price, b.category, b.photo_url,
    b.prep_minutes, b.is_available, b.restaurant_id, b.restaurant_name, b.slug,
    b.town, b.address, b.lat, b.lng, b.logo_url, b.rating, b.rating_count,
    b.is_accepting_orders, b.is_open, b.distance_km
  FROM base b
  -- A NULL distance means the customer shared no location; filtering those
  -- out would leave a location-less visitor with an empty page.
  WHERE (_max_km IS NULL OR b.distance_km IS NULL OR b.distance_km <= _max_km)
    AND (NOT _open_only OR b.is_open)
  ORDER BY
    CASE WHEN _sort = 'price_asc'  THEN b.price END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN b.price END DESC NULLS LAST,
    CASE WHEN _sort = 'distance'   THEN b.distance_km END ASC NULLS LAST,
    CASE WHEN _sort = 'rating'     THEN b.rating END DESC NULLS LAST,
    CASE WHEN _sort = 'prep'       THEN b.prep_minutes END ASC NULLS LAST,
    -- Deterministic tie-break, and the fallback when _sort is unrecognised.
    b.distance_km ASC NULLS LAST,
    b.price ASC,
    b.item_id ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 60), 1), 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_dishes(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, menu_category,
  DOUBLE PRECISION, NUMERIC, BOOLEAN, BOOLEAN, TEXT, INT
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Restaurants near a point — powers the map view and the "around you" list.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurants_nearby(
  _lat DOUBLE PRECISION DEFAULT NULL,
  _lng DOUBLE PRECISION DEFAULT NULL,
  _town TEXT DEFAULT NULL,
  _max_km DOUBLE PRECISION DEFAULT NULL,
  _open_only BOOLEAN DEFAULT false,
  _limit INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  description TEXT,
  town TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  logo_url TEXT,
  cover_url TEXT,
  rating NUMERIC,
  rating_count INT,
  avg_prep_minutes INT,
  is_accepting_orders BOOLEAN,
  is_open BOOLEAN,
  distance_km DOUBLE PRECISION,
  dish_count BIGINT,
  min_price NUMERIC
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      r.id, r.name, r.slug, r.description, r.town, r.address, r.lat, r.lng,
      r.logo_url, r.cover_url, r.rating, r.rating_count, r.avg_prep_minutes,
      r.is_accepting_orders,
      public.is_restaurant_open(r.id) AS is_open,
      public.haversine_km(_lat, _lng, r.lat, r.lng) AS distance_km,
      (SELECT count(*) FROM public.menu_items mi
        WHERE mi.restaurant_id = r.id AND mi.is_available) AS dish_count,
      (SELECT min(mi.price) FROM public.menu_items mi
        WHERE mi.restaurant_id = r.id AND mi.is_available) AS min_price
    FROM public.restaurants r
    WHERE r.status = 'active'
      AND (_town IS NULL OR btrim(_town) = '' OR lower(r.town) = lower(btrim(_town)))
  )
  SELECT
    b.id, b.name, b.slug, b.description, b.town, b.address, b.lat, b.lng,
    b.logo_url, b.cover_url, b.rating, b.rating_count, b.avg_prep_minutes,
    b.is_accepting_orders, b.is_open, b.distance_km, b.dish_count, b.min_price
  FROM base b
  WHERE (_max_km IS NULL OR b.distance_km IS NULL OR b.distance_km <= _max_km)
    AND (NOT _open_only OR b.is_open)
  ORDER BY b.distance_km ASC NULLS LAST, b.rating DESC, b.name ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 60), 1), 200);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restaurants_nearby(
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT, DOUBLE PRECISION, BOOLEAN, INT
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Towns that actually have something to order, for the manual area picker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.active_towns()
RETURNS TABLE (town TEXT, restaurant_count BIGINT)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT r.town, count(*) AS restaurant_count
  FROM public.restaurants r
  WHERE r.status = 'active'
  GROUP BY r.town
  ORDER BY count(*) DESC, r.town ASC;
$$;

GRANT EXECUTE ON FUNCTION public.active_towns() TO anon, authenticated;
