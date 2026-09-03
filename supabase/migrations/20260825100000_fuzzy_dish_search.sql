-- ===========================================================================
-- ChakulaFast — typo-tolerant dish search.
--
-- Someone hunting for lunch types "ugaly", "chipsi mayai" or "piliau" and the
-- substring match returns nothing, which reads as "no kitchen near you sells
-- this" rather than "you misspelled it". That is the worst possible failure
-- for the app's single most important query.
--
-- Fixed with pg_trgm's word-similarity operator (`<%`), which compares the
-- query against the closest word-boundary run inside search_text:
--
--   word_similarity('ugaly', 'ugali na maharage') = 0.67   -> matches
--   similarity     ('ugaly', 'ugali na maharage') = 0.20   -> would not
--
-- word_similarity is the right one precisely because a dish name is a few
-- words and the query is usually one of them. Plain similarity() dilutes the
-- score across the whole string and misses.
--
-- `<%` is index-backed by the existing GIN trigram index on search_text, so
-- this stays a cheap query rather than a sequential scan with a function call
-- per row.
-- ===========================================================================

-- The index and operator are load-bearing now rather than a nice-to-have, so
-- this is no longer wrapped in an exception handler: if pg_trgm genuinely
-- cannot be installed we want the migration to say so, not to silently ship
-- a search that can't spell.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
BEGIN
  CREATE INDEX menu_items_search_trgm_idx
    ON public.menu_items USING gin (search_text extensions.gin_trgm_ops);
EXCEPTION WHEN duplicate_table THEN
  NULL; -- already created by the core schema migration
END $$;

-- CREATE OR REPLACE cannot change a function's return type, and this adds
-- is_fuzzy_match to the returned row — so the old signature has to go first.
DROP FUNCTION IF EXISTS public.search_dishes(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, menu_category,
  DOUBLE PRECISION, NUMERIC, BOOLEAN, BOOLEAN, TEXT, INT
);

CREATE FUNCTION public.search_dishes(
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
  distance_km DOUBLE PRECISION,
  -- true when the dish only matched approximately, so the UI can say
  -- "showing results for ugali" instead of pretending it was exact.
  is_fuzzy_match BOOLEAN
)
LANGUAGE plpgsql STABLE SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE
  needle TEXT := lower(btrim(COALESCE(_q, '')));
  -- Below three characters a trigram query matches almost everything, so
  -- fuzzy matching is only enabled once there is enough to go on.
  fuzzy_ok BOOLEAN := length(needle) >= 3;
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
      public.haversine_km(_lat, _lng, r.lat, r.lng) AS distance_km,
      (needle <> '' AND mi.search_text NOT LIKE '%' || needle || '%') AS is_fuzzy_match
    FROM public.menu_items mi
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE r.status = 'active'
      AND (
        needle = ''
        -- Exact substring first: "ugali" has to find both "Ugali na
        -- maharage" and "Nyama choma na ugali".
        OR mi.search_text LIKE '%' || needle || '%'
        -- Then the near-miss: index-backed word similarity.
        OR (fuzzy_ok AND needle <% mi.search_text)
      )
      AND (_town IS NULL OR btrim(_town) = '' OR lower(r.town) = lower(btrim(_town)))
      AND (_category IS NULL OR mi.category = _category)
      AND (_max_price IS NULL OR mi.price <= _max_price)
      AND (NOT _available_only OR mi.is_available)
  )
  SELECT
    b.item_id, b.item_name, b.description, b.price, b.category, b.photo_url,
    b.prep_minutes, b.is_available, b.restaurant_id, b.restaurant_name, b.slug,
    b.town, b.address, b.lat, b.lng, b.logo_url, b.rating, b.rating_count,
    b.is_accepting_orders, b.is_open, b.distance_km, b.is_fuzzy_match
  FROM base b
  WHERE (_max_km IS NULL OR b.distance_km IS NULL OR b.distance_km <= _max_km)
    AND (NOT _open_only OR b.is_open)
  ORDER BY
    -- Anything that matched exactly outranks a near-miss, whatever the
    -- chosen sort. Sorting a typo's approximate hits above a real match
    -- would make the feature feel broken even when it worked.
    b.is_fuzzy_match ASC,
    CASE WHEN _sort = 'price_asc'  THEN b.price END ASC NULLS LAST,
    CASE WHEN _sort = 'price_desc' THEN b.price END DESC NULLS LAST,
    CASE WHEN _sort = 'distance'   THEN b.distance_km END ASC NULLS LAST,
    CASE WHEN _sort = 'rating'     THEN b.rating END DESC NULLS LAST,
    CASE WHEN _sort = 'prep'       THEN b.prep_minutes END ASC NULLS LAST,
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
-- "Did you mean…" — the closest real dish name to what was typed.
--
-- Powers the correction line above the results. Deliberately a separate,
-- cheap call rather than another column on every result row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suggest_dish(_q TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT mi.name
  FROM public.menu_items mi
  JOIN public.restaurants r ON r.id = mi.restaurant_id
  WHERE r.status = 'active'
    AND mi.is_available
    AND length(btrim(COALESCE(_q, ''))) >= 3
    AND lower(btrim(_q)) <% mi.search_text
  ORDER BY extensions.word_similarity(lower(btrim(_q)), mi.search_text) DESC, mi.name ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_dish(TEXT) TO anon, authenticated;
