import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { assertServerFnOk } from "@/lib/serverFnErrors";
import { fetchAdminPayments, type AdminPaymentRow } from "@/lib/queries/adminTables";
import { qk } from "@/lib/queryClient";
import Paginator from "@/components/admin/Paginator";
import { formatTsh } from "@/lib/geo";
import { adminConfirmPayment, adminRejectPayment } from "@/lib/adminRestaurants.functions";
import ReceivedPaymentsPanel from "@/components/admin/ReceivedPaymentsPanel";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABEL } from "@/lib/restaurantStatus";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/payments")({ component: AdminPayments });

type Payment = AdminPaymentRow;

function AdminPayments() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState(0);
  const [settledPage, setSettledPage] = useState(0);

  const load = () => queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });

  // Two queries rather than one list split in the browser: the queue a human
  // works through stays short, while the settled history only ever grows, so
  // they page independently.
  const pendingQuery = useQuery({
    queryKey: qk.adminPayments({ tab: "pending", page: pendingPage }),
    queryFn: () => fetchAdminPayments({ statuses: ["submitted", "pending"], page: pendingPage }),
    placeholderData: (prev) => prev,
  });

  const settledQuery = useQuery({
    queryKey: qk.adminPayments({ tab: "settled", page: settledPage }),
    queryFn: () => fetchAdminPayments({ statuses: ["confirmed", "failed"], page: settledPage }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    // A vendor submitting a reference should appear here without a refresh —
    // the whole point of this screen is that somebody is waiting on it.
    const channel = supabase
      .channel("admin-payments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registration_payments" },
        () => void queryClient.invalidateQueries({ queryKey: ["admin", "payments"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // `load` is recreated every render; the client itself is stable, so this
    // subscribes once instead of tearing down and re-subscribing constantly.
  }, [queryClient]);

  const confirm = async (payment: Payment) => {
    setBusyId(payment.id);
    try {
      const result = assertServerFnOk(
        await adminConfirmPayment({ data: { paymentId: payment.id, note: null } }),
        "confirm that payment",
      );
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
      assertServerFnOk(
        await adminRejectPayment({ data: { paymentId: payment.id, note } }),
        "reject that payment",
      );
      toast.success("Payment rejected");
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't reject that payment."));
    } finally {
      setBusyId(null);
    }
  };

  const pending = pendingQuery.data?.rows ?? [];
  const settled = settledQuery.data?.rows ?? [];
  const pendingTotal = pendingQuery.data?.total ?? 0;
  const settledTotal = settledQuery.data?.total ?? 0;

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
            Anything recorded in “Money received” below reconciles itself. What is left here is what
            did not match — check those against the till statement before marking them received,
            since confirming is what publishes the listing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <ReceivedPaymentsPanel />

      <Tabs defaultValue="pending">
        <TabsList className="w-full">
          <TabsTrigger value="pending" className="flex-1">
            To verify ({pendingTotal})
          </TabsTrigger>
          <TabsTrigger value="settled" className="flex-1">
            Settled ({settledTotal})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-2 pt-4">
          {pendingQuery.isPending && <Skeleton className="h-24 w-full rounded-2xl" />}
          {!pendingQuery.isPending && pending.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nothing waiting. Every restaurant that has paid is live.
            </p>
          )}
          {pending.map((payment) => renderRow(payment, true))}
          {!pendingQuery.isPending && (
            <Paginator
              page={pendingPage}
              total={pendingTotal}
              rows={pending.length}
              onPage={setPendingPage}
              busy={pendingQuery.isFetching}
            />
          )}
        </TabsContent>

        <TabsContent value="settled" className="space-y-2 pt-4">
          {settled.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No settled payments yet.
            </p>
          )}
          {settled.map((payment) => renderRow(payment, false))}
          {!settledQuery.isPending && (
            <Paginator
              page={settledPage}
              total={settledTotal}
              rows={settled.length}
              onPage={setSettledPage}
              busy={settledQuery.isFetching}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
