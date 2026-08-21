import { useState } from "react";
import { toast } from "sonner";
import { ChefHat, Clock, Flame, Navigation, Phone, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatKm, formatTsh, ARRIVING_SOON_MINUTES } from "@/lib/geo";
import { formatClock } from "@/lib/hours";
import {
  minutesUntilArrival,
  minutesUntilCookStart,
  STATUS_LABEL_EN,
  ticketUrgency,
  VENDOR_NEXT,
  type OrderStatus,
} from "@/lib/orderStatus";
import { useNow } from "@/hooks/useNow";

export type VendorOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  total: number;
  prep_minutes: number;
  expected_arrival_at: string;
  created_at: string;
  note: string | null;
  customer_phone: string | null;
  arrival_mode: string;
  order_items: { id: string; name: string; qty: number; line_total: number }[];
  /** Most recent live position update, when the customer is sharing. */
  latestPing?: { eta_minutes: number | null; distance_km: number | null } | null;
};

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: "Accept",
  preparing: "Start cooking",
  ready: "Mark ready",
  completed: "Collected",
  cancelled: "Reject",
};

/**
 * One kitchen ticket.
 *
 * The whole layout is built around one number: minutes until cooking should
 * start, derived from the customer's arrival time minus the slowest dish's
 * prep time. That's what turns a pre-order into food that's ready — rather
 * than started — when someone walks in, and it's why the ticket shouts when
 * that moment arrives instead of just listing the order.
 */
export default function OrderTicket({
  order,
  onChanged,
}: {
  order: VendorOrder;
  onChanged: () => void;
}) {
  const now = useNow(15_000);
  const [busy, setBusy] = useState<OrderStatus | null>(null);

  const urgency = ticketUrgency(order.status, order.expected_arrival_at, order.prep_minutes, now);
  const untilCook = minutesUntilCookStart(order.expected_arrival_at, order.prep_minutes, now);
  const untilArrival = minutesUntilArrival(order.expected_arrival_at, now);
  const arrivingSoon = untilArrival <= ARRIVING_SOON_MINUTES && untilArrival >= 0;

  const advance = async (next: OrderStatus) => {
    setBusy(next);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: next,
          ...(next === "cancelled" ? { cancel_reason: "Cancelled by the restaurant" } : {}),
        })
        .eq("id", order.id);
      if (error) throw error;
      toast.success(`${order.code} · ${STATUS_LABEL_EN[next]}`);
      onChanged();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't update that order."));
    } finally {
      setBusy(null);
    }
  };

  const options = VENDOR_NEXT[order.status];
  const primary = options.find((s) => s !== "cancelled");
  const canCancel = options.includes("cancelled");

  const border =
    urgency === "late"
      ? "border-destructive"
      : urgency === "cook_now"
        ? "border-primary cook-now"
        : "border-border";

  return (
    <article className={`space-y-3 rounded-2xl border-2 bg-card p-4 shadow-card ${border}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold leading-tight">{order.code}</p>
          <p className="text-xs text-muted-foreground">
            Placed {formatClock(order.created_at)} · {STATUS_LABEL_EN[order.status]}
          </p>
        </div>
        <p className="shrink-0 font-display text-lg font-bold">{formatTsh(Number(order.total))}</p>
      </header>

      {/* ---------- The timing line ---------- */}
      <div
        className={`rounded-xl px-3 py-2.5 ${
          urgency === "late"
            ? "bg-destructive/10 text-destructive"
            : urgency === "cook_now"
              ? "bg-primary/15 text-primary"
              : "bg-muted/60"
        }`}
      >
        {urgency === "cook_now" || urgency === "late" ? (
          <p className="flex items-center gap-2 font-display text-base font-extrabold">
            <Flame className="h-5 w-5" />
            {urgency === "late"
              ? `START NOW — ${Math.abs(untilCook)} min behind`
              : "START COOKING NOW"}
          </p>
        ) : urgency === "waiting" ? (
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ChefHat className="h-4 w-4 text-muted-foreground" />
            Start cooking in {untilCook} min
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <ChefHat className="h-4 w-4" />
            Cooked — waiting for the customer
          </p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-90">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Arrives {formatClock(order.expected_arrival_at)}
            {untilArrival >= 0 ? ` (${untilArrival} min)` : ` (${Math.abs(untilArrival)} min ago)`}
          </span>
          <span>{order.prep_minutes} min to cook</span>
          {order.arrival_mode === "gps" && <span>· live GPS</span>}
        </p>

        {arrivingSoon && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-warning-foreground">
            <Navigation className="h-3 w-3" />
            ARRIVING IN {untilArrival} MIN
          </p>
        )}

        {order.latestPing?.eta_minutes != null && (
          <p className="mt-1 text-xs opacity-90">
            Customer is {order.latestPing.eta_minutes} min away
            {formatKm(order.latestPing.distance_km)
              ? ` (${formatKm(order.latestPing.distance_km)})`
              : ""}
          </p>
        )}
      </div>

      {/* ---------- What to cook ---------- */}
      <ul className="space-y-1">
        {order.order_items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0">
              <span className="font-display font-bold tabular-nums">{item.qty}×</span> {item.name}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {formatTsh(Number(item.line_total))}
            </span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          {order.note}
        </p>
      )}

      {/* ---------- Actions ---------- */}
      {(primary || canCancel) && (
        <div className="flex flex-wrap items-center gap-2">
          {primary && (
            <Button
              className="h-10 flex-1"
              onClick={() => advance(primary)}
              disabled={busy !== null}
            >
              {NEXT_LABEL[primary] ?? STATUS_LABEL_EN[primary]}
            </Button>
          )}
          {order.customer_phone && (
            <Button asChild variant="outline" size="icon" className="h-10 w-10">
              <a href={`tel:${order.customer_phone}`} aria-label="Call the customer">
                <Phone className="h-4 w-4" />
              </a>
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              className="h-10 text-destructive hover:text-destructive"
              onClick={() => advance("cancelled")}
              disabled={busy !== null}
            >
              {NEXT_LABEL.cancelled}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
