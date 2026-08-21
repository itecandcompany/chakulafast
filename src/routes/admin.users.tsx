import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search, ShieldOff, ShieldCheck, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { adminSetUserRole, adminSetUserSuspended } from "@/lib/adminUsers.functions";
import type { AppRole } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const ROLE_LABEL: Record<AppRole, string> = {
  customer: "Customer",
  restaurant: "Restaurant owner",
  admin: "Administrator",
};

function AdminUsers() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      toast.error(toUserMessage(error, "Couldn't load users."));
      setProfiles([]);
      return;
    }
    setProfiles(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (profile: Profile, role: AppRole) => {
    setBusyId(profile.id);
    try {
      await adminSetUserRole({ data: { targetUserId: profile.id, role } });
      toast.success(`${profile.full_name} → ${ROLE_LABEL[role]}`);
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't change that role."));
    } finally {
      setBusyId(null);
    }
  };

  const toggleSuspended = async (profile: Profile) => {
    setBusyId(profile.id);
    try {
      await adminSetUserSuspended({
        data: { targetUserId: profile.id, suspended: !profile.is_suspended },
      });
      toast.success(profile.is_suspended ? "Account restored" : "Account suspended");
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't change that account."));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (profiles ?? []).filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (!needle) return true;
      return (
        p.full_name.toLowerCase().includes(needle) ||
        (p.phone ?? "").toLowerCase().includes(needle) ||
        (p.town ?? "").toLowerCase().includes(needle)
      );
    });
  }, [profiles, query, roleFilter]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">
            {profiles ? `${profiles.length} accounts` : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone or town"
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | AppRole)}>
          <SelectTrigger className="w-48" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="customer">{ROLE_LABEL.customer}</SelectItem>
            <SelectItem value="restaurant">{ROLE_LABEL.restaurant}</SelectItem>
            <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {profiles === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {profiles !== null && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No users match those filters.
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((profile) => {
          const isSelf = profile.id === user?.id;
          return (
            <div
              key={profile.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-card"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                  </span>
                )}
              </div>

              <div className="min-w-40 flex-1">
                <p className="truncate font-semibold">
                  {profile.full_name}
                  {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  {profile.is_suspended && (
                    <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      Suspended
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile.phone ?? "no phone"} · {profile.town ?? "no area"} · joined{" "}
                  {new Date(profile.created_at).toLocaleDateString()}
                </p>
              </div>

              <Select
                value={profile.role}
                onValueChange={(v) => changeRole(profile, v as AppRole)}
                // Guarded server-side too, in adminSetUserRole — this just
                // keeps the UI from offering an action that would be refused.
                disabled={isSelf || busyId === profile.id}
              >
                <SelectTrigger className="h-9 w-44" aria-label={`Role of ${profile.full_name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">{ROLE_LABEL.customer}</SelectItem>
                  <SelectItem value="restaurant">{ROLE_LABEL.restaurant}</SelectItem>
                  <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="sm"
                className={`h-9 ${profile.is_suspended ? "text-success" : "text-destructive hover:text-destructive"}`}
                onClick={() => toggleSuspended(profile)}
                disabled={isSelf || busyId === profile.id}
              >
                {profile.is_suspended ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Restore
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-3.5 w-3.5" />
                    Suspend
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
