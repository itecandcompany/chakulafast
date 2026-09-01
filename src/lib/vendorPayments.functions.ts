import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceEmailConfirmed } from "@/lib/auth.server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/payments";

// The registration fee flow, from the restaurant's side.
//
// Everything privileged happens here rather than in the browser: the amount
// is read from platform_settings server-side, ownership is re-checked against
// the caller's own session (never against whatever id the client posted), and
// only then does the service-role client touch the payments table.

const submitSchema = z.object({
  restaurantId: z.string().uuid(),
  method: z.enum(["mpesa", "tigopesa", "airtel", "halopesa", "bank", "cash", "manual"]),
  reference: z.string().trim().min(3).max(64).optional().nullable(),
  msisdn: z.string().trim().min(9).max(20).optional().nullable(),
});

/**
 * Everything the billing page needs to render: the fee, where to send it, and
 * whether a human or a gateway will confirm it. The provider id lives in a
 * non-VITE_ env var, so the browser can't read it directly.
 */
export const getBillingContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ context }) => {
    const { data: settings } = await context.supabase
      .from("platform_settings")
      .select("registration_fee_tzs, currency, till_number, payment_instructions")
      .maybeSingle();

    const provider = getPaymentProvider();

    return {
      fee: Number(settings?.registration_fee_tzs ?? 5000),
      currency: settings?.currency ?? "TZS",
      tillNumber: settings?.till_number ?? process.env.VITE_PAYMENT_TILL_NUMBER ?? null,
      instructions: settings?.payment_instructions ?? null,
      provider: {
        id: provider.id,
        label: provider.label,
        methods: provider.methods,
        requiresManualConfirmation: provider.requiresManualConfirmation,
      },
    };
  });

export const submitRegistrationPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .middleware([requireSupabaseAuth, enforceEmailConfirmed])
  .handler(async ({ data, context }) => {
    enforceRateLimit("registration-payment", context.userId, { windowMs: 60_000, max: 10 });

    // RLS-scoped read: this returns nothing unless the caller really owns
    // the restaurant, so it doubles as the ownership check.
    const { data: restaurant, error: restaurantError } = await context.supabase
      .from("restaurants")
      .select("id, name, status, owner_id")
      .eq("id", data.restaurantId)
      .eq("owner_id", context.userId)
      .maybeSingle();

    if (restaurantError) throw new Error("Unable to load your restaurant");
    if (!restaurant) throw new Response("Restaurant not found", { status: 404 });

    if (restaurant.status === "suspended" || restaurant.status === "rejected") {
      throw new Response("This listing is suspended. Contact support before paying again.", {
        status: 400,
      });
    }
    if (restaurant.status === "active") {
      return { status: "already_active" as const, message: "Your listing is already active." };
    }

    const provider = getPaymentProvider();
    if (!provider.methods.includes(data.method as PaymentMethod)) {
      throw new Response("That payment method isn't available right now.", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: confirmed } = await supabaseAdmin
      .from("registration_payments")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .eq("status", "confirmed")
      .maybeSingle();

    if (confirmed) {
      return {
        status: "already_paid" as const,
        message: "This restaurant has already paid its registration fee.",
      };
    }

    // Reuse an open attempt rather than piling up rows every time the vendor
    // corrects a mistyped reference — the partial unique index only covers
    // confirmed rows, so nothing else would stop the pile-up.
    const { data: open } = await supabaseAdmin
      .from("registration_payments")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .in("status", ["pending", "submitted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let paymentId = open?.id;

    if (!paymentId) {
      // amount and currency are overwritten by prepare_registration_payment()
      // from platform_settings; the values here are only placeholders.
      const { data: created, error: insertError } = await supabaseAdmin
        .from("registration_payments")
        .insert({
          restaurant_id: restaurant.id,
          amount: 0,
          method: data.method,
          reference: data.reference ?? null,
          msisdn: data.msisdn ?? null,
          status: "submitted",
        })
        .select("id")
        .single();

      if (insertError || !created) throw new Error("Unable to record your payment");
      paymentId = created.id;
    } else {
      const { error: updateError } = await supabaseAdmin
        .from("registration_payments")
        .update({
          method: data.method,
          reference: data.reference ?? null,
          msisdn: data.msisdn ?? null,
          status: "submitted",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      if (updateError) throw new Error("Unable to record your payment");
    }

    const { data: payment } = await supabaseAdmin
      .from("registration_payments")
      .select("amount, currency")
      .eq("id", paymentId)
      .single();

    const result = await provider.initiate({
      paymentId,
      restaurantId: restaurant.id,
      amount: Number(payment?.amount ?? 0),
      currency: payment?.currency ?? "TZS",
      method: data.method,
      msisdn: data.msisdn ?? null,
      reference: data.reference ?? null,
    });

    // A provider that settles synchronously confirms the row here; the
    // activate_restaurant_on_payment() trigger publishes the listing.
    if (result.kind === "confirmed") {
      const { error } = await supabaseAdmin
        .from("registration_payments")
        .update({
          status: "confirmed",
          provider_payload: { providerRef: result.providerRef },
        })
        .eq("id", paymentId);
      if (error) throw new Error("Payment went through but activation failed — contact support");

      return {
        status: "confirmed" as const,
        message: "Payment confirmed. Your listing is live.",
        paymentId,
      };
    }

    if (result.kind === "redirect") {
      return { status: "redirect" as const, url: result.url, paymentId };
    }

    if (result.kind === "push_sent") {
      await supabaseAdmin
        .from("registration_payments")
        .update({ provider_payload: { providerRef: result.providerRef } })
        .eq("id", paymentId);
      return { status: "push_sent" as const, message: result.message, paymentId };
    }

    return { status: "submitted" as const, message: result.message, paymentId };
  });
