-- ===========================================================================
-- ChakulaFast — reviews.
--
-- Only a customer who actually collected an order can review, once, and only
-- the restaurant that cooked it. That constraint is what makes "sort by
-- rating" mean anything.
-- ===========================================================================

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants ON DELETE CASCADE,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  -- Recorded because it is the promise the app makes: was the food actually
  -- ready when they walked in? Surfaced on the restaurant page.
  was_ready_on_time BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reviews_restaurant_idx ON public.reviews (restaurant_id, created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews of active restaurants" ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = reviews.restaurant_id AND r.status = 'active'
    )
  );

CREATE POLICY "Owner and admin read own reviews" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    auth.uid() = customer_id
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = reviews.restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- The order must be theirs, completed, and at the restaurant being reviewed.
CREATE POLICY "Customer reviews own completed order" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = reviews.order_id
        AND o.customer_id = auth.uid()
        AND o.restaurant_id = reviews.restaurant_id
        AND o.status = 'completed'
    )
  );

CREATE POLICY "Customer edits own review" ON public.reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- Rollup rather than an aggregate on read: the rating is displayed on every
-- search result row, so it needs to be a column, not a subquery.
CREATE OR REPLACE FUNCTION public.recalc_restaurant_rating()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target UUID := COALESCE(NEW.restaurant_id, OLD.restaurant_id);
BEGIN
  UPDATE public.restaurants r
     SET rating = COALESCE((
           SELECT round(avg(rv.stars)::numeric, 2)
           FROM public.reviews rv WHERE rv.restaurant_id = target
         ), 0),
         rating_count = (
           SELECT count(*) FROM public.reviews rv WHERE rv.restaurant_id = target
         )
   WHERE r.id = target;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalc_restaurant_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_restaurant_rating();

-- ---------------------------------------------------------------------------
-- Public review feed for a restaurant page.
--
-- `profiles` is deliberately readable only by its owner and admins, so a
-- plain join can't get the reviewer's name. This function exposes exactly one
-- extra field — the first name — and nothing else from the profile, which is
-- the smallest disclosure that still makes a review look like it came from a
-- person rather than from nobody.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restaurant_reviews(_restaurant_id UUID, _limit INT DEFAULT 20)
RETURNS TABLE (
  id UUID,
  stars INT,
  comment TEXT,
  was_ready_on_time BOOLEAN,
  created_at TIMESTAMPTZ,
  reviewer_first_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    rv.id,
    rv.stars,
    rv.comment,
    rv.was_ready_on_time,
    rv.created_at,
    split_part(btrim(p.full_name), ' ', 1) AS reviewer_first_name
  FROM public.reviews rv
  JOIN public.restaurants r ON r.id = rv.restaurant_id
  LEFT JOIN public.profiles p ON p.id = rv.customer_id
  WHERE rv.restaurant_id = _restaurant_id
    -- SECURITY DEFINER bypasses RLS, so the "only active restaurants are
    -- public" rule has to be restated here explicitly.
    AND r.status = 'active'
  ORDER BY rv.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.restaurant_reviews(UUID, INT) TO anon, authenticated;

-- Called directly by the restaurant page to render its open/closed badge from
-- the same logic the search results use.
GRANT EXECUTE ON FUNCTION public.is_restaurant_open(UUID, TIMESTAMPTZ) TO anon, authenticated;
