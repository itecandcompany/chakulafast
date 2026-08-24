-- ===========================================================================
-- ChakulaFast — image storage and realtime publication.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Storage: dish photos, restaurant logos/covers, customer avatars.
--
-- One public bucket, partitioned by uploader: every object must live under
-- `{auth.uid()}/…`, which is what the folder check below enforces. Public
-- read is intentional — menu photos are shown to guests who have no session.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-photos', 'menu-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Menu photos are publicly readable" ON storage.objects;
CREATE POLICY "Menu photos are publicly readable" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'menu-photos');

DROP POLICY IF EXISTS "Users upload into own folder" ON storage.objects;
CREATE POLICY "Users upload into own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users replace own uploads" ON storage.objects;
CREATE POLICY "Users replace own uploads" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'menu-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own uploads" ON storage.objects;
CREATE POLICY "Users delete own uploads" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'menu-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Realtime
--
-- REPLICA IDENTITY FULL so subscribers receive the previous row on UPDATE —
-- without it the vendor board can't tell an accepted order from a re-ping,
-- and the customer's status tracker misses transitions.
--
-- Realtime respects RLS, so a vendor subscribed to `orders` still only
-- receives rows for their own restaurant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_events REPLICA IDENTITY FULL;
ALTER TABLE public.order_pings REPLICA IDENTITY FULL;
ALTER TABLE public.restaurants REPLICA IDENTITY FULL;
ALTER TABLE public.registration_payments REPLICA IDENTITY FULL;

-- menu_items is deliberately NOT set to REPLICA IDENTITY FULL.
--
-- It carries a STORED GENERATED column (search_text), and from PostgreSQL 18
-- a published table whose replica identity includes an unpublished generated
-- column rejects every UPDATE:
--
--   ERROR 42P10: cannot update table "menu_items"
--   DETAIL: Replica identity must not contain unpublished generated columns.
--
-- That would break every menu edit — including the out-of-stock toggle the
-- vendor screen leans on during service. The default replica identity (the
-- primary key) is all this table needs anyway: subscribers here only use the
-- event to refetch, and INSERT/UPDATE payloads carry the full new row
-- regardless of replica identity. Only the *old* row is trimmed, and nothing
-- subscribes to menu_items deletions.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders', 'order_events', 'order_pings',
    'menu_items', 'restaurants', 'registration_payments'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN
        RAISE NOTICE 'supabase_realtime publication missing; skipping %', t;
    END;
  END LOOP;
END $$;
