import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import type { PaymentMethod } from "@/lib/payments";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABEL } from "@/lib/restaurantStatus";
import { getBillingContext, submitRegistrationPayment } from "@/lib/vendorPayments.functions";
import { useVendor } from "@/lib/vendorContext";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/vendor/billing")({ component: VendorBilling });

type Payment = Database["public"]["Tables"]["registration_payments"]["Row"];
type BillingContext = Awaited<ReturnType<typeof getBillingContext>>;

function VendorBilling() {
  const { restaurant, refresh } = useVendor();

  const [context, setContext] = useState<BillingContext | null>(null);
  // Held separately from `context` so a failure shows an explanation on the
  // page rather than a skeleton that never resolves.
  const [contextError, setContextError] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [msisdn, setMsisdn] = useState(restaurant.phone ?? "");
  const [submitting, setSubmitting] = useState(false);

  const loadPayments = useCallback(async () => {
    const { data, error } = await supabase
      .from("registration_payments")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(toUserMessage(error, "Couldn't load your payment history."));
      setPayments([]);
      return;
    }
    setPayments(data ?? []);
  }, [restaurant.id]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result: unknown = await getBillingContext();
        if (cancelled) return;

        // A server function that fails its middleware does not always reject —
        // it can resolve with the error payload instead. So a truthy result is
        // not proof of a usable one, and trusting it here is what turned a
        // recoverable server-side failure into a crashed page: the render read
        // `context.provider.label` on a value that had no provider at all.
        const usable =
          !!result && typeof result === "object" && !!(result as BillingContext).provider;

        if (!usable) {
          setContextError(
            "The server couldn't load your billing details. Two things usually cause this: the site's server-side Supabase keys (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are missing from the deployment, or this account's email address has not been confirmed.",
          );
          return;
        }

        setContext(result as BillingContext);
      } catch (err) {
        if (!cancelled) setContextError(toUserMessage(err, "Couldn't load billing details."));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadPayments();

    // An admin confirming the payment happens in another session entirely —
    // without this the vendor would sit on a stale page wondering whether it
    // went through.
    const channel = supabase
      .channel(`vendor-payments-${restaurant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registration_payments",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => {
          void loadPayments();
          void refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant.id, loadPayments, refresh]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitRegistrationPayment({
        data: {
          restaurantId: restaurant.id,
          method,
          reference: reference.trim() || null,
          msisdn: msisdn.trim() || null,
        },
      });

      if (result.status === "redirect") {
        window.location.href = result.url;
        return;
      }

      toast.success("message" in result ? result.message : "Payment recorded");
      setReference("");
      await Promise.all([loadPayments(), refresh()]);
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't record your payment."));
    } finally {
      setSubmitting(false);
    }
  };

  const isActive = restaurant.status === "active";
  const confirmed = payments?.find((p) => p.status === "confirmed") ?? null;
  const pending = payments?.find((p) => p.status === "submitted" || p.status === "pending") ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          One payment, once. There is no commission on orders — customers pay you directly.
        </p>
      </div>

      {/* ---------- Status ---------- */}
      {isActive ? (
        <section className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="font-display font-bold text-success">Your listing is live</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Customers can find {restaurant.name} in search and place pre-orders.
              {confirmed?.confirmed_at &&
                ` Registration fee received on ${new Date(confirmed.confirmed_at).toLocaleDateString()}.`}
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="font-display font-bold text-warning-foreground">
            {pending ? "Waiting for your payment to be verified" : "Your listing isn't live yet"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pending
              ? "An administrator is checking your transaction reference against our records. You'll see this page update as soon as it clears."
              : "Pay the one-time registration fee below and your menu becomes visible to customers."}
          </p>
        </section>
      )}

      {/* ---------- Pay ---------- */}
      {!isActive && (
        <section className="rounded-2xl border bg-card p-4 shadow-card">
          {contextError ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              {contextError}
            </p>
          ) : context === null ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-xl font-extrabold">{formatTsh(context.fee)}</p>
                  <p className="text-xs text-muted-foreground">
                    One-time registration fee · {context.provider.label}
                  </p>
                </div>
              </div>

              {context.tillNumber && (
                <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">
                  Send to till number{" "}
                  <span className="font-display font-bold">{context.tillNumber}</span>
                </p>
              )}

              {context.instructions && (
                <p className="mt-2 text-sm text-muted-foreground">{context.instructions}</p>
              )}

              <form onSubmit={submit} className="mt-4 space-y-3">
                <div>
                  <span className="mb-1.5 block text-sm font-medium">Payment method</span>
                  <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                    <SelectTrigger aria-label="Payment method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {context.provider.methods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {method !== "cash" && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Mobile money is not switched on yet — the fee is collected in cash for now.
                      Pick <span className="font-medium">Cash</span> and an admin will activate your
                      listing once it&apos;s received.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="billing-msisdn" className="mb-1.5 block text-sm font-medium">
                    Phone number you paid from
                  </label>
                  <Input
                    id="billing-msisdn"
                    type="tel"
                    inputMode="tel"
                    value={msisdn}
                    onChange={(e) => setMsisdn(e.target.value)}
                    placeholder="07XX XXX XXX"
                  />
                </div>

                {context.provider.requiresManualConfirmation && (
                  <div>
                    <label htmlFor="billing-reference" className="mb-1.5 block text-sm font-medium">
                      Transaction reference{" "}
                      {method === "cash" && (
                        <span className="font-normal text-muted-foreground">(not needed)</span>
                      )}
                    </label>
                    <Input
                      id="billing-reference"
                      // Cash has no transaction ID. Demanding one would leave a
                      // vendor who has already handed over the money unable to
                      // submit anything at all.
                      required={method !== "cash"}
                      disabled={method === "cash"}
                      minLength={3}
                      maxLength={64}
                      value={method === "cash" ? "" : reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder={
                        method === "cash" ? "Paid in person" : "From your confirmation SMS"
                      }
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {method === "cash"
                        ? "Hand the fee to the ChakulaFast team and submit this — we'll activate your listing once it's received."
                        : "Copy it exactly — it's what we match against the till statement."}
                    </p>
                  </div>
                )}

                <Button type="submit" size="lg" className="h-12 w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {pending ? "Update payment details" : "I've paid — submit for verification"}
                </Button>
              </form>
            </>
          )}
        </section>
      )}

      {/* ---------- History ---------- */}
      <section className="rounded-2xl border bg-card shadow-card">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <h2 className="font-display text-sm font-bold">Payment history</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={loadPayments}
            aria-label="Refresh payment history"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {payments === null && <Skeleton className="m-3 h-16" />}

        {payments?.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}

        <div className="divide-y">
          {payments?.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-display font-bold">
                  {formatTsh(Number(payment.amount))}{" "}
                  <span className="font-sans text-xs font-normal text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS]}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(payment.created_at).toLocaleString()}
                  {payment.reference ? ` · ref ${payment.reference}` : ""}
                </p>
                {payment.note && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{payment.note}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLORS[payment.status]}`}
              >
                {PAYMENT_STATUS_LABEL[payment.status]}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
