import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Store, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { useT } from "@/lib/i18n";
import { TOWNS } from "@/lib/towns";

const authSearchSchema = z.object({
  role: z.enum(["customer", "restaurant"]).optional().catch(undefined),
  mode: z.enum(["signin", "signup"]).optional().catch(undefined),
  // An allow-list rather than a free string: this value is fed straight to
  // navigate() after sign-in, and an arbitrary one would be an open redirect.
  redirect: z.enum(["/cart", "/orders", "/account"]).optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (search) => authSearchSchema.parse(search),
  ssr: false,
  component: AuthPage,
});

const GOOGLE_ENABLED = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";
const REGISTRATION_FEE = Number(import.meta.env.VITE_REGISTRATION_FEE_TZS ?? 5000);

function AuthPage() {
  const t = useT();
  const navigate = useNavigate();
  const params = Route.useSearch();
  const { user, profile, loading } = useAuth();

  const [role, setRole] = useState<"customer" | "restaurant">(params.role ?? "customer");
  const [mode, setMode] = useState<"signin" | "signup">(params.mode ?? "signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [town, setTown] = useState<string>("Moshi");
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  // Once a session and its profile exist, send the user where their role
  // belongs. Doing this in an effect (rather than after signIn resolves)
  // also covers arriving here with an existing session, and the OAuth
  // round trip, which lands back on this route with no local state.
  useEffect(() => {
    if (loading || !user || !profile) return;
    if (profile.role === "restaurant") navigate({ to: "/vendor" });
    else if (profile.role === "admin") navigate({ to: "/admin" });
    else navigate({ to: params.redirect ?? "/" });
  }, [user, profile, loading, navigate, params.redirect]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // handle_new_user() reads these to build the profile. It rejects
            // anything other than 'customer'/'restaurant', so this metadata
            // can't be used to self-promote to admin.
            data: {
              full_name: fullName.trim(),
              phone: phone.trim() || null,
              town,
              role,
            },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error) throw error;

        // No session means the project requires email confirmation.
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
      // The redirect happens in the effect above, once the profile loads.
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't sign you in."));
    } finally {
      setSubmitting(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't start Google sign-in."));
    }
  };

  if (checkEmail) {
    return (
      <div className="grid min-h-[var(--app-100vh)] place-items-center bg-background px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-lg font-bold text-primary-foreground">
            C
          </div>
          <h1 className="mt-4 font-display text-xl font-bold">{t("auth.checkEmail")}</h1>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              setCheckEmail(false);
              setMode("signin");
            }}
          >
            {t("auth.submitSignIn")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[var(--app-100vh)] bg-background">
      <div className="mx-auto flex min-h-[var(--app-100vh)] max-w-md flex-col px-4 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("auth.browseAsGuest")}
        </Link>

        <div className="mt-8">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-base font-bold text-primary-foreground shadow-elegant">
            C
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold leading-tight">
            {mode === "signup"
              ? role === "restaurant"
                ? t("auth.vendorTitle")
                : t("auth.customerTitle")
              : t("auth.signInTitle")}
          </h1>
        </div>

        {/* ---------- Who is signing up ---------- */}
        {mode === "signup" && (
          <fieldset className="mt-5">
            <legend className="sr-only">Account type</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "customer", label: t("auth.asCustomer"), Icon: UtensilsCrossed },
                  { value: "restaurant", label: t("auth.asVendor"), Icon: Store },
                ] as const
              ).map((option) => (
                <label key={option.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="account-role"
                    value={option.value}
                    checked={role === option.value}
                    onChange={() => setRole(option.value)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full flex-col gap-2 rounded-2xl border-2 bg-card p-3 text-sm font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <option.Icon className="h-5 w-5 text-primary" />
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {mode === "signup" && role === "restaurant" && (
          <p className="mt-3 rounded-xl bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            {t("auth.vendorFeeNotice", { fee: formatTsh(REGISTRATION_FEE) })}
          </p>
        )}

        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === "signup" && (
            <>
              <div>
                <label htmlFor="auth-name" className="mb-1.5 block text-sm font-medium">
                  {t("auth.nameLabel")}
                </label>
                <Input
                  id="auth-name"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="auth-phone" className="mb-1.5 block text-sm font-medium">
                  {t("auth.phoneLabel")}
                </label>
                <Input
                  id="auth-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium">{t("auth.townLabel")}</span>
                <Select value={town} onValueChange={setTown}>
                  <SelectTrigger aria-label={t("auth.townLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOWNS.map((tw) => (
                      <SelectItem key={tw.name} value={tw.name}>
                        {tw.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium">
              {t("auth.emailLabel")}
            </label>
            <Input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium">
              {t("auth.passwordLabel")}
            </label>
            <Input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" && (
              <p className="mt-1 text-xs text-muted-foreground">{t("auth.passwordHint")}</p>
            )}
          </div>

          <Button type="submit" size="lg" className="h-12 w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signup" ? t("auth.submitSignUp") : t("auth.submitSignIn")}
          </Button>
        </form>

        {GOOGLE_ENABLED && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("auth.or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="h-12 w-full" onClick={signInWithGoogle}>
              {t("auth.google")}
            </Button>
          </>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="font-semibold text-primary hover:underline"
          >
            {mode === "signup" ? t("auth.submitSignIn") : t("auth.submitSignUp")}
          </button>
        </p>

        <div className="mt-auto pt-6 text-center">
          <Link to="/privacy" className="text-xs text-muted-foreground hover:underline">
            {t("common.privacy")}
          </Link>
        </div>
      </div>
    </div>
  );
}
