import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, LogOut, Shield, Store, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppTabBar from "@/components/AppTabBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";
import { useT } from "@/lib/i18n";
import { uploadPhoto, validateImage } from "@/lib/photos";
import { TOWNS } from "@/lib/towns";

export const Route = createFileRoute("/account")({
  ssr: false,
  component: AccountPage,
});

function AccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [town, setTown] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { role: "customer", mode: "signin", redirect: "/account" } });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setPhone(profile.phone ?? "");
    setTown(profile.town ?? "");
  }, [profile]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          town: town || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t("account.saved"));
    } catch (err) {
      toast.error(toUserMessage(err, t("common.somethingWrong")));
    } finally {
      setSaving(false);
    }
  };

  const onPickPhoto = async (file: File | undefined) => {
    if (!file || !user) return;
    const problem = validateImage(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhoto(user.id, file, "avatar");
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t("account.saved"));
    } catch (err) {
      toast.error(toUserMessage(err, t("common.somethingWrong")));
    } finally {
      setUploading(false);
    }
  };

  if (loading || !user || !profile) {
    return (
      <div className="grid min-h-[var(--app-100vh)] place-items-center text-muted-foreground lg:pl-60">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="border-b bg-background px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-xl font-bold">{t("account.title")}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-4 sm:px-6 lg:px-10">
        {/* ---------- Profile ---------- */}
        <section className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 overflow-hidden rounded-2xl bg-muted">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground">
                    <UserIcon className="h-6 w-6" />
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label={t("account.photo")}
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-card disabled:opacity-60"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onPickPhoto(e.target.files?.[0])}
              />
            </div>

            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold">{profile.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="account-name" className="mb-1.5 block text-sm font-medium">
                {t("account.name")}
              </label>
              <Input
                id="account-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="account-phone" className="mb-1.5 block text-sm font-medium">
                {t("account.phone")}
              </label>
              <Input
                id="account-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium">{t("account.town")}</span>
              <Select value={town} onValueChange={setTown}>
                <SelectTrigger aria-label={t("account.town")}>
                  <SelectValue placeholder={t("filter.area")} />
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

            <Button onClick={save} disabled={saving || !fullName.trim()} className="w-full">
              {t("common.save")}
            </Button>
          </div>
        </section>

        {/* ---------- Role shortcuts ---------- */}
        {profile.role === "restaurant" && (
          <Button asChild variant="outline" className="h-12 w-full justify-start">
            <Link to="/vendor">
              <Store className="h-4 w-4" />
              {t("account.myRestaurant")}
            </Link>
          </Button>
        )}

        {profile.role === "admin" && (
          <Button asChild variant="outline" className="h-12 w-full justify-start">
            <Link to="/admin">
              <Shield className="h-4 w-4" />
              {t("account.adminConsole")}
            </Link>
          </Button>
        )}

        <section className="rounded-2xl border bg-card p-4 shadow-card">
          <LanguageSwitcher />
        </section>

        <div className="space-y-3">
          <Button
            variant="ghost"
            className="h-12 w-full justify-start text-destructive hover:text-destructive"
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
          >
            <LogOut className="h-4 w-4" />
            {t("common.signOut")}
          </Button>

          <Link
            to="/privacy"
            className="block px-4 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("common.privacy")}
          </Link>
        </div>
      </main>

      <AppTabBar />
    </div>
  );
}
