-- ChakulaFast — first-admin bootstrap.
--
-- The platform has a chicken-and-egg problem at launch. handle_new_user()
-- deliberately refuses to honour role='admin' from signup metadata, and
-- user_roles has no INSERT policy, so the only way to mint an admin is the
-- service_role key via scripts/seed-admin.mjs. That is correct for a running
-- platform and useless for an operator who has not set that key up: a
-- restaurant can register and pay, but nobody can confirm the payment, so no
-- listing ever goes live.
--
-- This opens exactly one door, exactly once. A named email may claim admin for
-- itself, and the claim is burned on use. Three things have to hold:
--
--   1. the platform currently has NO admin — so this can never be used to add
--      a second one, or to re-take a platform that already has an owner;
--   2. the caller is signed in, and is claiming their OWN account;
--   3. their email matches the one seeded below.
--
-- After it fires, bootstrap_admin_email is NULL and every later call fails on
-- both (1) and (3). Granting admin from then on is the admin console's job.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS bootstrap_admin_email TEXT;

COMMENT ON COLUMN public.platform_settings.bootstrap_admin_email IS
  'The single email allowed to claim the first admin account. Set to NULL the '
  'moment it is used; a NULL here means the bootstrap door is shut for good.';

-- The operator this deployment was handed to. Not a secret — it is a claim
-- ticket that is worthless the moment either the ticket or the admin seat is
-- taken, and worthless to anyone who cannot sign in to that mailbox.
UPDATE public.platform_settings
   SET bootstrap_admin_email = 'gene@admin.com'
 WHERE id;

CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  claimant TEXT;
  expected TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_SIGNIN_REQUIRED'
      USING HINT = 'Sign in with the bootstrap account first.';
  END IF;

  -- (1) Never a second admin. This is the check that makes the function safe
  -- to leave in the schema permanently.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'BOOTSTRAP_CLOSED'
      USING HINT = 'This platform already has an administrator.';
  END IF;

  SELECT bootstrap_admin_email INTO expected FROM public.platform_settings WHERE id;
  IF expected IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_CLOSED'
      USING HINT = 'The bootstrap claim has already been used.';
  END IF;

  -- (2) + (3): the caller's own account, and only the named one. Reading the
  -- email from auth.users rather than taking it as an argument is the point —
  -- a caller cannot name someone else's address.
  SELECT email INTO claimant FROM auth.users WHERE id = uid;
  IF claimant IS NULL OR lower(claimant) <> lower(expected) THEN
    RAISE EXCEPTION 'BOOTSTRAP_NOT_ELIGIBLE'
      USING HINT = 'This account is not the one this platform was set up for.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Burn the ticket. Without this, deleting the admin row would re-open the
  -- door for anyone who could get hold of that mailbox later.
  UPDATE public.platform_settings SET bootstrap_admin_email = NULL WHERE id;

  RETURN claimant;
END;
$$;

-- anon must not reach this: the signed-in check inside would reject it anyway,
-- but there is no reason to let an unauthenticated caller probe whether the
-- platform still has no admin.
REVOKE ALL ON FUNCTION public.bootstrap_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

-- Lets the bootstrap page say "already done" instead of offering a button that
-- can only fail. Deliberately returns a bare boolean and never the email — the
-- claim ticket itself is not something an anonymous visitor should be able to
-- read off the platform.
CREATE OR REPLACE FUNCTION public.bootstrap_available()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
     AND EXISTS (
           SELECT 1 FROM public.platform_settings
           WHERE id AND bootstrap_admin_email IS NOT NULL
         );
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_available() TO anon, authenticated;
