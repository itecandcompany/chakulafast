import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// Admin-only user management actions. These run server-side so they can use
// the service-role client (client.server.ts) — never expose that key to the
// browser. Every handler independently re-verifies the caller is an admin
// via their own session (context.supabase, RLS-scoped), regardless of what
// the client-side UI already checked.

const roleSchema = z.object({
  targetUserId: z.string().uuid(),
  role: z.enum(["customer", "restaurant", "admin"]),
});

const suspendSchema = z.object({
  targetUserId: z.string().uuid(),
  suspended: z.boolean(),
});

async function requireAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

async function countAdmins(supabaseAdmin: SupabaseClient<Database>) {
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  return count ?? 0;
}

async function isAdmin(supabaseAdmin: SupabaseClient<Database>, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export const adminSetUserRole = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => roleSchema.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    if (data.targetUserId === context.userId) {
      throw new Response("You cannot change your own role from here", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role !== "admin" && (await isAdmin(supabaseAdmin, data.targetUserId))) {
      if ((await countAdmins(supabaseAdmin)) <= 1) {
        throw new Response("Cannot remove the last admin", { status: 400 });
      }
    }

    // Demoting a restaurant owner would orphan their listing — customers
    // could still order from a kitchen nobody can log in to manage.
    if (data.role !== "restaurant") {
      const { data: owned } = await supabaseAdmin
        .from("restaurants")
        .select("id, name")
        .eq("owner_id", data.targetUserId)
        .maybeSingle();
      if (owned) {
        throw new Response(
          `This user owns "${owned.name}". Suspend or delete that listing before changing their role.`,
          { status: 400 },
        );
      }
    }

    // user_roles is the source of truth; the sync_profile_role() trigger
    // mirrors it onto profiles.role, so only this table is written here.
    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.targetUserId);
    if (deleteError) throw new Error("Unable to update role");

    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.targetUserId, role: data.role });
    if (insertError) throw new Error("Unable to update role");

    return { ok: true as const };
  });

export const adminSetUserSuspended = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => suspendSchema.parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context);

    if (data.targetUserId === context.userId) {
      throw new Response("You cannot suspend your own account", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.suspended && (await isAdmin(supabaseAdmin, data.targetUserId))) {
      if ((await countAdmins(supabaseAdmin)) <= 1) {
        throw new Response("Cannot suspend the last admin", { status: 400 });
      }
    }

    // Ban (or unban) at the auth level — this is what actually stops the
    // user: a banned account can't sign in, and any live session stops
    // working once its short-lived access token needs to refresh.
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      ban_duration: data.suspended ? "876000h" : "none",
    });
    if (authError) throw new Error("Unable to update account status");

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ is_suspended: data.suspended })
      .eq("id", data.targetUserId);
    if (profileError) throw new Error("Unable to update account status");

    // Suspending an owner takes their kitchen off the market too — nobody is
    // left who can accept the orders it would keep receiving.
    if (data.suspended) {
      await supabaseAdmin
        .from("restaurants")
        .update({ is_accepting_orders: false })
        .eq("owner_id", data.targetUserId);
    }

    return { ok: true as const };
  });
