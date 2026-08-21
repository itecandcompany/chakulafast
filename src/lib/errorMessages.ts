// Turns a raw error (Postgres/PostgREST, network, or unknown) into a message
// that's safe to show a user. Raw error text can leak table/column/constraint
// names or internal wording, so nothing reaches the UI unverified: known-safe
// messages (the ones our own DB guard triggers raise, written to be
// user-facing) pass through as-is, common failure classes get a friendly
// translation, and everything else falls back to a generic message. The
// original error is always logged for debugging.

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

// Exact text (or prefix, for messages built with "... %" in SQL) of
// RAISE EXCEPTION strings from supabase/migrations — these were authored
// as user-facing messages and contain no schema/internal details.
const SAFE_DB_MESSAGE_PREFIXES = [
  "A payment cannot be created as already confirmed",
  "Cannot change account status directly",
  "Cannot change role directly",
  "Cannot change the restaurant web address once it is set",
  "Cannot transfer a restaurant to another owner",
  "Listing status is set by the platform",
  "Not authorized to update this order",
  "Order can only be cancelled before the kitchen starts cooking",
  "Order details cannot be changed after it is placed",
  "Order status cannot move from",
  "Ratings are calculated from customer reviews",
  "The kitchen cannot change the customer arrival details",
  "An order cannot mix dishes from different restaurants",
  "Every order line must reference a dish on the menu",
  "That dish is no longer on the menu",
  "That dish is out of stock right now",
  "That order no longer exists",
];

export function toUserMessage(error: unknown, fallback: string = DEFAULT_FALLBACK): string {
  if (error) console.error(error);

  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;

  if (SAFE_DB_MESSAGE_PREFIXES.some((safe) => raw.startsWith(safe))) return raw;

  const m = raw.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Network error — check your connection and try again.";
  }
  if (m.includes("jwt") || m.includes("session") || m.includes("token")) {
    return "Your session has expired. Please sign in again.";
  }
  if (
    m.includes("row-level security") ||
    m.includes("permission denied") ||
    m.includes("forbidden")
  ) {
    return "You don't have permission to do that.";
  }
  if (m.includes("duplicate key") || m.includes("already exists")) {
    return "That already exists.";
  }
  if (m.includes("violates") || m.includes("constraint") || m.includes("invalid input syntax")) {
    return "That couldn't be saved — please check your input and try again.";
  }

  return fallback;
}
