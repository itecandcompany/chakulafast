import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceEmailConfirmed } from "@/lib/auth.server";
import type { Database } from "@/integrations/supabase/types";
import { enforceRateLimit } from "@/lib/rateLimit";

// Admin-only listing and payment moderation. These run server-side so they
// can use the service-role client (client.server.ts) — never expose that key
// to the browser. Every handler independently re-verifies the caller is an
// admin via their own session (context.supabase, RLS-scoped), regardless of
// what the client-side UI already checked.

const statusSchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(["pending_payment", "active", "suspended", "rejected"]),
  reason: z.string().trim().max(280).optional().nullable(),
});

const paymentSchema = z.object({
  paymentId: z.string().uuid(),
  note: z.string().trim().max(280).optional().nullable(),
});

const deleteSchema = z.object({
  restaurantId: z.string().uuid(),
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

/**
 * Approve, suspend, reject or reset a listing.
 *
 * Activating by hand is a real and necessary power — a restaurant that paid
 * in cash at the office still has to go live — so it is allowed, but it is
 * never implicit: it only happens when an admin explicitly picks 'active'.
 */
export const adminSetRestaurantStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ data, context }) => {
    enforceRateLimit("admin-restaurant-status", context.userId, { windowMs: 60_000, max: 30 });
    await requireAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({
        status: data.status,
        suspended_reason:
          data.status === "suspended" || data.status === "rejected" ? (data.reason ?? null) : null,
        // A suspended kitchen must stop appearing to take orders, or
        // customers will keep pre-ordering into a listing nobody is watching.
        ...(data.status === "active" ? {} : { is_accepting_orders: false }),
      })
      .eq("id", data.restaurantId);

    if (error) throw new Error("Unable to update the listing");

    return { ok: true as const };
  });

/**
 * Mark a registration payment received. This is the manual half of the
 * payment flow — the trigger on registration_payments does the actual
 * activation, so this never touches `restaurants` itself.
 */
export const adminConfirmPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => paymentSchema.parse(input))
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ data, context }) => {
    enforceRateLimit("admin-payment-confirm", context.userId, { windowMs: 60_000, max: 30 });
    await requireAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment, error: readError } = await supabaseAdmin
      .from("registration_payments")
      .select("id, status, restaurant_id")
      .eq("id", data.paymentId)
      .maybeSingle();

    if (readError) throw new Error("Unable to load that payment");
    if (!payment) throw new Response("Payment not found", { status: 404 });
    if (payment.status === "confirmed") {
      return { ok: true as const, alreadyConfirmed: true };
    }

    const { error } = await supabaseAdmin
      .from("registration_payments")
      .update({
        status: "confirmed",
        note: data.note ?? null,
        // Attributed to the admin who clicked, not the service role — see
        // stamp_payment_confirmation() for why this is passed explicitly.
        confirmed_by: context.userId,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", data.paymentId);

    if (error) throw new Error("Unable to confirm that payment");

    return { ok: true as const, alreadyConfirmed: false };
  });

export const adminRejectPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => paymentSchema.parse(input))
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ data, context }) => {
    enforceRateLimit("admin-payment-reject", context.userId, { windowMs: 60_000, max: 30 });
    await requireAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment } = await supabaseAdmin
      .from("registration_payments")
      .select("status")
      .eq("id", data.paymentId)
      .maybeSingle();

    if (!payment) throw new Response("Payment not found", { status: 404 });
    if (payment.status === "confirmed") {
      throw new Response(
        "That payment is already confirmed. Suspend the listing instead if it was a mistake.",
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("registration_payments")
      .update({ status: "failed", note: data.note ?? null })
      .eq("id", data.paymentId);

    if (error) throw new Error("Unable to reject that payment");

    return { ok: true as const };
  });

/**
 * Hard-delete a listing.
 *
 * Only possible while it has no order history: `orders.restaurant_id` is
 * ON DELETE RESTRICT precisely so a kitchen can't take its financial record
 * with it. Checking first lets us say why instead of surfacing a foreign-key
 * error, and points the admin at the action they actually want.
 */
export const adminDeleteRestaurant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ data, context }) => {
    enforceRateLimit("admin-restaurant-delete", context.userId, { windowMs: 60_000, max: 30 });
    await requireAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId);

    if ((count ?? 0) > 0) {
      throw new Response(
        `This restaurant has ${count} order(s) on record and can't be deleted. Suspend it instead — it disappears from search either way.`,
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin.from("restaurants").delete().eq("id", data.restaurantId);

    if (error) throw new Error("Unable to delete that listing");

    return { ok: true as const };
  });
