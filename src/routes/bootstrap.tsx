import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldX, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";

/**
 * One-time claim page for the platform's first administrator.
 *
 * Deliberately NOT under /admin: that layout bounces anyone who isn't already
 * an admin, which is everybody who needs this page.
 *
 * There is no security in this screen — bootstrap_admin() re-checks every
 * condition server-side, reads the caller's email from auth.users rather than
 * trusting anything sent from here, and closes permanently once the platform
 * has an owner. This is only the button.
 */
export const Route = createFileRoute("/bootstrap")({
  ssr: false,
  component: BootstrapPage,
});

function BootstrapPage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    // The postgrest builder is a thenable, not a Promise — no .catch on it.
    void (async () => {
      try {
        const { data } = await supabase.rpc("bootstrap_available");
        setAvailable(data === true);
      } catch {
        // Treat an unreachable check as closed: showing a claim button that
        // can only fail is worse than showing none.
        setAvailable(false);
      }
    })();
  }, []);

  // Already an admin — nothing to do here.
  useEffect(() => {
    if (!loading && profile?.role === "admin") navigate({ to: "/admin" });
  }, [loading, profile?.role, navigate]);

  const claim = async () => {
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("bootstrap_admin");
      if (error) throw error;
      toast.success(`${data} is now the platform administrator.`);
      // The role arrives via the sync trigger, so the cached profile is stale.
      window.location.assign("/admin");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("BOOTSTRAP_CLOSED")) {
        setAvailable(false);
        toast.error("This platform already has an administrator.");
      } else if (message.includes("BOOTSTRAP_NOT_ELIGIBLE")) {
        toast.error("This account is not the one this platform was set up for.");
      } else {
        toast.error(toUserMessage(err, "Couldn't claim admin access."));
      }
    } finally {
      setClaiming(false);
    }
  };

  if (loading || available === null) {
    return (
      <div className="grid min-h-[var(--app-100vh)] place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[var(--app-100vh)] max-w-lg place-items-center px-4">
      <div className="w-full rounded-2xl border bg-card p-6 shadow-card">
        {!available ? (
          <>
            <ShieldX className="h-8 w-8 text-muted-foreground" />
            <h1 className="mt-3 font-display text-xl font-bold">Bootstrap closed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This platform already has an administrator, or the one-time claim has been used. New
              admins are granted from the admin console.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/">Back to ChakulaFast</Link>
            </Button>
          </>
        ) : !user ? (
          <>
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="mt-3 font-display text-xl font-bold">Claim admin access</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This platform has no administrator yet. Sign in with the account it was set up for,
              then come back to this page to claim it.
            </p>
            <Button asChild className="mt-4">
              <Link
                to="/auth"
                search={{ role: "customer", mode: "signin", redirect: "/bootstrap" }}
              >
                Sign in
              </Link>
            </Button>
          </>
        ) : (
          <>
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="mt-3 font-display text-xl font-bold">Claim admin access</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You are signed in as <span className="font-medium text-foreground">{user.email}</span>
              . If this is the account this platform was set up for, claiming makes it the
              administrator — once. Every later admin is granted from the console.
            </p>

            {/* Every privileged server function is behind enforceEmailConfirmed,
                so an unconfirmed admin can sign in and see the console but every
                action inside it fails with a 403. Better to say so here than to
                let them discover it on the payment they're trying to approve. */}
            {!user.email_confirmed_at && (
              <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <MailWarning className="h-4 w-4 shrink-0" />
                <span>
                  This email isn&apos;t confirmed yet. You can claim the role, but approving
                  payments and changing roles will be refused until it is — confirm the link in your
                  inbox first.
                </span>
              </p>
            )}

            <Button className="mt-4" onClick={claim} disabled={claiming}>
              {claiming && <Loader2 className="h-4 w-4 animate-spin" />}
              Make this account the administrator
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
