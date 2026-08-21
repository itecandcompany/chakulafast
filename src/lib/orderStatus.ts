import type { TKey } from "@/lib/i18n";

export const ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The happy path, in order. `cancelled` is deliberately absent: it's an exit
 * from any of these rather than a step, so the customer's progress tracker
 * renders it separately instead of as a sixth dot.
 */
export const ORDER_PIPELINE = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
] as const satisfies ReadonlyArray<OrderStatus>;

// Anything the kitchen still has work to do on. Drives the vendor board's
// "live" tab and the customer's "you have an order in progress" banner.
export const LIVE_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
] as const satisfies ReadonlyArray<OrderStatus>;

export function isLive(status: OrderStatus) {
  return (LIVE_STATUSES as readonly OrderStatus[]).includes(status);
}

export function pipelineIndex(status: OrderStatus) {
  return (ORDER_PIPELINE as readonly OrderStatus[]).indexOf(status);
}

/**
 * What the kitchen is allowed to do next. Mirrors guard_order_update() in
 * supabase/migrations — the database is the authority, this just keeps the
 * UI from offering a button that would be rejected.
 */
export const VENDOR_NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// The customer may only pull out before the kitchen commits ingredients.
export function customerCanCancel(status: OrderStatus) {
  return status === "pending" || status === "accepted";
}

// Every stage is built from the app's own tokens (primary, warning, success,
// destructive) rather than arbitrary Tailwind hues, so status badges stay in
// sync with the rest of the UI when the palette changes.
export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  accepted: "bg-primary/10 text-primary",
  preparing: "bg-primary/15 text-primary",
  ready: "bg-success/15 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "text-warning",
  accepted: "text-primary",
  preparing: "text-primary",
  ready: "text-success",
  completed: "text-muted-foreground",
  cancelled: "text-destructive",
};

export const STATUS_LABEL_KEY: Record<OrderStatus, TKey> = {
  pending: "status.pending",
  accepted: "status.accepted",
  preparing: "status.preparing",
  ready: "status.ready",
  completed: "status.completed",
  cancelled: "status.cancelled",
};

/** English labels for the operator surfaces (vendor board, admin console). */
export const STATUS_LABEL_EN: Record<OrderStatus, string> = {
  pending: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Collected",
  cancelled: "Cancelled",
};

/**
 * The heart of the pre-order promise: the moment the kitchen should start
 * cooking so the food lands on the counter exactly as the customer walks in.
 *
 * Returns minutes from `now` — negative means "you are already late", which
 * is what flips the ticket into its COOK NOW state.
 */
export function minutesUntilCookStart(
  expectedArrivalAt: string | Date,
  prepMinutes: number,
  now: Date = new Date(),
) {
  const arrival = new Date(expectedArrivalAt).getTime();
  const startCookingAt = arrival - prepMinutes * 60_000;
  return Math.round((startCookingAt - now.getTime()) / 60_000);
}

export function minutesUntilArrival(expectedArrivalAt: string | Date, now: Date = new Date()) {
  return Math.round((new Date(expectedArrivalAt).getTime() - now.getTime()) / 60_000);
}

/**
 * How a ticket should read at a glance across a busy counter.
 *
 *   waiting  — plenty of time, don't start yet
 *   cook_now — start cooking to hit the arrival time
 *   late     — the food should already be underway
 *   done     — cooked; waiting on the customer
 */
export type TicketUrgency = "waiting" | "cook_now" | "late" | "done";

export function ticketUrgency(
  status: OrderStatus,
  expectedArrivalAt: string | Date,
  prepMinutes: number,
  now: Date = new Date(),
): TicketUrgency {
  if (status === "ready" || status === "completed" || status === "cancelled") return "done";

  const untilCook = minutesUntilCookStart(expectedArrivalAt, prepMinutes, now);
  if (untilCook > 2) return "waiting";
  // A two-minute grace band around the ideal start avoids a ticket flickering
  // between states on every re-render as the clock ticks past the boundary.
  if (untilCook >= -3) return "cook_now";
  return "late";
}
