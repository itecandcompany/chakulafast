import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CustomerOrder } from "@/components/customer/CustomerOrderCard";
import type { VendorOrder } from "@/components/vendor/OrderTicket";

// The select strings used to be inline in both the customer and the vendor
// screen, which meant adding a column to one and forgetting the other. They
// live here so the two can't drift.

const CUSTOMER_SELECT = `
  id, code, status, total, prep_minutes, expected_arrival_at, created_at,
  cancel_reason, note,
  restaurants ( id, name, slug, lat, lng, address, town ),
  order_items ( id, name, qty, line_total, menu_item_id ),
  reviews ( id )
`;

const VENDOR_SELECT = `
  id, code, status, total, prep_minutes, expected_arrival_at, created_at,
  note, customer_phone, arrival_mode,
  order_items ( id, name, qty, line_total ),
  order_pings ( eta_minutes, distance_km, created_at )
`;

export async function fetchCustomerOrders(userId: string): Promise<CustomerOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(CUSTOMER_SELECT)
    .eq("customer_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as unknown as CustomerOrder[];
}

type RawVendorOrder = Omit<VendorOrder, "latestPing"> & {
  order_pings: { eta_minutes: number | null; distance_km: number | null; created_at: string }[];
};

export async function fetchVendorOrders(restaurantId: string): Promise<VendorOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(VENDOR_SELECT)
    .eq("restaurant_id", restaurantId)
    .order("expected_arrival_at", { ascending: true })
    .limit(100);

  if (error) throw error;

  return ((data ?? []) as unknown as RawVendorOrder[]).map((row) => {
    const pings = [...(row.order_pings ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    return { ...row, latestPing: pings[0] ?? null } as VendorOrder;
  });
}

/**
 * Apply a realtime UPDATE to a cached list in place.
 *
 * This is the whole point of adopting react-query here. Previously every
 * realtime event refetched the entire list — 50 orders and three joins for a
 * customer, 100 orders plus every ping for a vendor — to reflect one changed
 * column. A kitchen with ten live tickets and customers sharing GPS was
 * re-reading its whole board every few seconds.
 *
 * Realtime hands us the new row, so the columns it carries are merged into the
 * cached entry and the joined relations (order_items, restaurants) are kept
 * from the existing cache — the payload doesn't include them, and refetching
 * just to get them back would defeat the exercise.
 *
 * Returns false when the row isn't in the cache, which means the list shape
 * changed and the caller should invalidate instead.
 */
export function patchCachedOrder<T extends { id: string }>(
  queryClient: QueryClient,
  key: readonly unknown[],
  updated: Partial<T> & { id: string },
): boolean {
  const current = queryClient.getQueryData<T[]>(key);
  if (!current) return false;

  const index = current.findIndex((o) => o.id === updated.id);
  if (index === -1) return false;

  const next = [...current];
  next[index] = { ...next[index], ...updated };
  queryClient.setQueryData(key, next);
  return true;
}
