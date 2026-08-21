import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { adminConfirmPayment, adminRejectPayment } from "@/lib/adminRestaurants.functions";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABEL } from "@/lib/restaurantStatus";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/payments")({ component: AdminPayments });

type Payment = Database["public"]["Tables"]["registration_payments"]["Row"] & {
  restaurants: { id: string; name: string; town: string; status: string } | null;
};

function AdminPayments() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("registration_payments")
      .select("*, restaurants ( id, name, town, status )")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast.error(toUserMessage(error, "Couldn't load payments."));
      setPayments([]);
      return;
    }
    setPayments((data ?? []) as unknown as Payment[]);
  }, []);

  useEffect(() => {
    void load();

    // A vendor submitting a reference should appear here without a refresh —
    // the whole point of this screen is that somebody is waiting on it.
    const channel = supabase
      .channel("admin-payments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registration_payments" },
        () => void load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const confirm = async (payment: Payment) => {
    setBusyId(payment.id);
    try {
      const result = await adminConfirmPayment({ data: { paymentId: payment.id, note: null } });
      toast.success(
        result.alreadyConfirmed
          ? "That payment was already confirmed."
          : `${payment.restaurants?.name ?? "Restaurant"} is now live.`,
      );
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't confirm that payment."));
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (payment: Payment) => {
    const note = window.prompt(
      "Why is this payment being rejected? The restaurant sees this note.",
      "Transaction reference not found on the till statement",
    );
    if (note === null) return;

    setBusyId(payment.id);
    try {
      await adminRejectPayment({ data: { paymentId: payment.id, note } });
      toast.success("Payment rejected");
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't reject that payment."));
    } finally {
      setBusyId(null);
    }
  };

  const pending = payments?.filter((p) => p.status === "submitted" || p.status === "pending") ?? [];
  const settled = payments?.filter((p) => p.status === "confirmed" || p.status === "failed") ?? [];

  const renderRow = (payment: Payment, actionable: boolean) => (
    <div
      key={payment.id}
      className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-card"
    >
      <div className="min-w-40 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">
            {payment.restaurants?.name ?? "Deleted restaurant"}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAYMENT_STATUS_COLORS[payment.status]}`}
          >
            {PAYMENT_STATUS_LABEL[payment.status]}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {payment.restaurants?.town ?? "—"} ·{" "}
          {PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS]}
          {payment.msisdn ? ` · ${payment.msisdn}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Submitted {new Date(payment.submitted_at ?? payment.created_at).toLocaleString()}
        </p>
        {payment.note && <p className="mt-0.5 text-xs text-muted-foreground">{payment.note}</p>}
      </div>

      <div className="min-w-40">
        <p className="font-display text-lg font-bold">{formatTsh(Number(payment.amount))}</p>
        {payment.reference && (
          <p className="font-mono text-xs text-muted-foreground">ref {payment.reference}</p>
        )}
      </div>

      {actionable && (
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            className="h-9"
            onClick={() => confirm(payment)}
            disabled={busyId === payment.id}
          >
            <Check className="h-3.5 w-3.5" />
            Mark received
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-destructive hover:text-destructive"
            onClick={() => reject(payment)}
            disabled={busyId === payment.id}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Registration payments</h1>
          <p className="text-sm text-muted-foreground">
            Check each reference against the till statement before marking it received — confirming
            is what publishes the listing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1">
            To verify ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="settled" className="flex-1">
            Settled ({settled.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-2 pt-4">
          {payments === null && <Skeleton className="h-24 w-full rounded-2xl" />}
          {payments !== null && pending.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nothing waiting. Every restaurant that has paid is live.
            </p>
          )}
          {pending.map((payment) => renderRow(payment, true))}
        </TabsContent>

        <TabsContent value="settled" className="space-y-2 pt-4">
          {settled.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No settled payments yet.
            </p>
          )}
          {settled.map((payment) => renderRow(payment, false))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
