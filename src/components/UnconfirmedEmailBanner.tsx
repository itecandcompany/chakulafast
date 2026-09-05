import { MailWarning } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Warns when the signed-in account's email has never been confirmed.
 *
 * This is the app's nastiest failure mode, because nothing looks wrong. The
 * dashboards render — their role checks run in the browser — while every
 * privileged action is refused by enforceEmailConfirmed on the server. The
 * operator clicks Approve, sees the page reload, and finds nothing changed.
 *
 * A whole afternoon went into chasing that as a bug in the console, so the
 * condition now announces itself on the screens it breaks rather than waiting
 * to be deduced from a 403 that the client never even gets to read.
 */
export default function UnconfirmedEmailBanner() {
  const { user, loading } = useAuth();

  if (loading || !user || user.email_confirmed_at) return null;

  return (
    <div className="flex items-start gap-2 border-b bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{user.email} is not confirmed.</span> You can see these
        pages, but the server will refuse every action on them — approving a listing, confirming a
        payment, changing a role — and the refusal is silent. Click the link in that inbox, or turn
        off <span className="font-medium">Confirm email</span> in Supabase under Authentication →
        Providers.
      </p>
    </div>
  );
}
