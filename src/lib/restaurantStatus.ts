import type { Database } from "@/integrations/supabase/types";

export type RestaurantStatus = Database["public"]["Enums"]["restaurant_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

/**
 * Operator-facing labels. Deliberately English-only — the vendor dashboard
 * and admin console are operator tools; see the scope note in lib/i18n.tsx.
 */
export const RESTAURANT_STATUS_LABEL: Record<RestaurantStatus, string> = {
  pending_payment: "Awaiting payment",
  active: "Active",
  suspended: "Suspended",
  rejected: "Rejected",
};

export const RESTAURANT_STATUS_COLORS: Record<RestaurantStatus, string> = {
  pending_payment: "bg-warning/15 text-warning-foreground",
  active: "bg-success/15 text-success",
  suspended: "bg-destructive/10 text-destructive",
  rejected: "bg-muted text-muted-foreground",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Not paid",
  submitted: "Awaiting verification",
  confirmed: "Received",
  failed: "Rejected",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  submitted: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-success/15 text-success",
  failed: "bg-destructive/10 text-destructive",
};

/** A listing is only visible to customers when it is active. */
export function isPubliclyVisible(status: RestaurantStatus) {
  return status === "active";
}
