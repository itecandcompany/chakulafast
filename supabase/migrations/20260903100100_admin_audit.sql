-- ChakulaFast — an append-only record of what administrators did.
--
-- Every privileged action already runs through a server function holding the
-- service-role key: suspending an account, granting a role, confirming a
-- payment that publishes a listing, deleting a restaurant. None of them left a
-- trace. With more than one administrator that is a real gap — "who took this
-- restaurant down, and why" had no answer, and the vendor asking is owed one.
--
-- Two design points, both about the log being worth trusting:
--
--   * There is no INSERT, UPDATE or DELETE policy. Clients cannot write here
--     at all; only the service role can, from inside the server functions that
--     perform the action being recorded. A log the acting party can write by
--     hand is not evidence of anything.
--
--   * subject_label stores the name as it was at the time. The whole point of
--     this table is to survive the thing it describes — a restaurant that was
--     deleted still has to be nameable in the row recording its deletion, and
--     a foreign key alone would leave "deleted restaurant".

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, not CASCADE: removing an administrator must not erase the
  -- record of what they did.
  actor_id UUID REFERENCES auth.users ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'restaurant', 'payment')),
  subject_id UUID,
  subject_label TEXT,
  -- The reason an admin typed, where the action asks for one.
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_recent_idx
  ON public.admin_actions (created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read the audit log" ON public.admin_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Append-only. RLS already stops clients writing, so this is aimed at the
-- service role: an entry that can be edited after the fact is not a record of
-- what happened, it is a record of what someone last wanted it to say.
CREATE OR REPLACE FUNCTION public.admin_actions_are_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The admin audit log is append-only';
END;
$$;

CREATE TRIGGER trg_admin_actions_append_only
  BEFORE UPDATE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.admin_actions_are_append_only();

-- Recording is deliberately a function rather than a bare INSERT so the
-- actor's name is resolved once, here, instead of at every call site.
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _actor UUID,
  _action TEXT,
  _subject_type TEXT,
  _subject_id UUID,
  _subject_label TEXT,
  _detail TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  who TEXT;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE id = _actor;

  INSERT INTO public.admin_actions
    (actor_id, actor_name, action, subject_type, subject_id, subject_label, detail)
  VALUES
    (_actor, who, _action, _subject_type, _subject_id, _subject_label, _detail);
END;
$$;

-- Only the service role calls this, from inside the server functions. Letting
-- a signed-in client reach it would let anyone write whatever they liked into
-- the record of what administrators did.
REVOKE ALL ON FUNCTION public.log_admin_action(UUID, TEXT, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
