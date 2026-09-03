import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side paging and filtering for the admin console's four tables.
 *
 * Every one of these screens used to pull a fixed slice — 500 profiles, 200
 * orders, 200 payments — into memory and filter it in the browser. That is not
 * only a scale problem. Searching a truncated slice silently searches *some*
 * of the platform and reports the result as if it were all of it, so the first
 * user who falls off the end of the list becomes invisible to the console with
 * no indication anything was hidden. Pushing both the filter and the window
 * into Postgres is what makes the answer honest.
 *
 * Everything returns a total alongside the rows so the UI can say
 * "showing 1-25 of 413" — an admin needs to know what they are *not* seeing.
 */

export const ADMIN_PAGE_SIZE = 25;

export type Page<T> = {
  rows: T[];
  /** Total matching the current filters, not the current page. */
  total: number;
};

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];
type OrderStatus = Database["public"]["Enums"]["order_status"];
type RestaurantStatus = Database["public"]["Enums"]["restaurant_status"];

/** PostgREST `or=` is a comma-separated list, so a comma in the needle would
 *  be read as a clause separator. Parentheses and commas are the characters
 *  that can break out; strip them rather than escape, since none of them are
 *  meaningful in a name or a phone number. */
function safeNeedle(query: string): string {
  return query.trim().replace(/[,()]/g, " ").trim();
}

const rangeFor = (page: number) => ({
  from: page * ADMIN_PAGE_SIZE,
  to: page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1,
});

// --- users -----------------------------------------------------------------

export type UserFilters = { query: string; role: "all" | AppRole; page: number };

export async function fetchAdminUsers(f: UserFilters): Promise<Page<Profile>> {
  const { from, to } = rangeFor(f.page);
  let q = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (f.role !== "all") q = q.eq("role", f.role);

  const needle = safeNeedle(f.query);
  if (needle) {
    q = q.or(`full_name.ilike.%${needle}%,phone.ilike.%${needle}%,town.ilike.%${needle}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

// --- orders ----------------------------------------------------------------

export const ADMIN_ORDER_SELECT = `
  id, code, status, total, prep_minutes, expected_arrival_at, created_at, cancel_reason,
  restaurants ( name, town ),
  order_items ( id, name, qty )
`;

export type AdminOrderRow = {
  id: string;
  code: string;
  status: OrderStatus;
  total: number;
  prep_minutes: number;
  expected_arrival_at: string;
  created_at: string;
  cancel_reason: string | null;
  restaurants: { name: string; town: string } | null;
  order_items: { id: string; name: string; qty: number }[];
};

export type OrderFilters = { query: string; status: "all" | OrderStatus; page: number };

export async function fetchAdminOrders(f: OrderFilters): Promise<Page<AdminOrderRow>> {
  const { from, to } = rangeFor(f.page);
  let q = supabase
    .from("orders")
    .select(ADMIN_ORDER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (f.status !== "all") q = q.eq("status", f.status);

  // Only the order code is searchable server-side: restaurant name and
  // customer name live in joined tables, and PostgREST cannot filter the
  // parent by an embedded column without turning the join into an inner one —
  // which would silently drop orders whose restaurant was deleted.
  const needle = safeNeedle(f.query);
  if (needle) q = q.ilike("code", `%${needle}%`);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as AdminOrderRow[], total: count ?? 0 };
}

// --- registration payments -------------------------------------------------

export const ADMIN_PAYMENT_SELECT = `
  id, restaurant_id, amount, currency, method, reference, msisdn, status,
  note, submitted_at, confirmed_at, created_at,
  restaurants ( id, name, town, status )
`;

export type AdminPaymentRow = {
  id: string;
  restaurant_id: string;
  amount: number;
  currency: string;
  // Enum-typed, not string: the status and method both index label/colour
  // lookups keyed by the enum, and widening them here would push an `any`
  // into every one of those call sites.
  method: Database["public"]["Enums"]["payment_method"];
  reference: string | null;
  msisdn: string | null;
  status: Database["public"]["Enums"]["payment_status"];
  note: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  restaurants: { id: string; name: string; town: string; status: RestaurantStatus } | null;
};

type PaymentStatus = Database["public"]["Enums"]["payment_status"];

/**
 * Takes a set of statuses rather than one, because the screen is split into
 * "waiting on you" and "settled" and each half needs to page independently.
 * The queue a human works through is short; the settled history only grows.
 */
export type PaymentFilters = { statuses: PaymentStatus[]; page: number };

export async function fetchAdminPayments(f: PaymentFilters): Promise<Page<AdminPaymentRow>> {
  const { from, to } = rangeFor(f.page);
  const { data, error, count } = await supabase
    .from("registration_payments")
    .select(ADMIN_PAYMENT_SELECT, { count: "exact" })
    .in("status", f.statuses)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { rows: (data ?? []) as unknown as AdminPaymentRow[], total: count ?? 0 };
}

// --- restaurants -----------------------------------------------------------

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

export type RestaurantFilters = { query: string; status: "all" | RestaurantStatus; page: number };

export async function fetchAdminRestaurants(f: RestaurantFilters): Promise<Page<Restaurant>> {
  const { from, to } = rangeFor(f.page);
  let q = supabase
    .from("restaurants")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (f.status !== "all") q = q.eq("status", f.status);

  const needle = safeNeedle(f.query);
  if (needle) {
    q = q.or(`name.ilike.%${needle}%,town.ilike.%${needle}%,address.ilike.%${needle}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
