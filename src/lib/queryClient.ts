import { QueryClient } from "@tanstack/react-query";

/**
 * Shared query client.
 *
 * Defaults are tuned for a marketplace where most data is either pushed by
 * Supabase Realtime or genuinely slow-moving:
 *
 * - `staleTime: 30s` — the screens that must be live (order board, order
 *   tracking) are driven by realtime events that patch the cache directly, so
 *   background polling would be pure waste. Everything else tolerates being
 *   half a minute old.
 * - `refetchOnWindowFocus: false` — a vendor tabbing between the board and
 *   their menu would otherwise refire every query on every switch, all day.
 * - One retry, not three. On a Tanzanian mobile connection, three retries with
 *   backoff means a user stares at a spinner for ten seconds before being told
 *   it failed. Fail fast and let them press the button again.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/**
 * Query keys in one place.
 *
 * Realtime handlers reach into the cache by key to patch a single row, so
 * these have to match exactly between the component that reads and the
 * subscription that writes — which is precisely the kind of thing that rots
 * when the strings are duplicated across files.
 */
export const qk = {
  customerOrders: (userId: string) => ["orders", "customer", userId] as const,
  vendorOrders: (restaurantId: string) => ["orders", "vendor", restaurantId] as const,
  vendorPayments: (restaurantId: string) => ["payments", "vendor", restaurantId] as const,
  vendorInsights: (restaurantId: string, days: number) => ["insights", restaurantId, days] as const,
  adminSummary: () => ["admin", "summary"] as const,
  adminPayments: () => ["admin", "payments"] as const,
  restaurant: (slug: string) => ["restaurant", slug] as const,
  dishSearch: (filters: unknown, origin: unknown) => ["search", filters, origin] as const,
  nearby: (origin: unknown, town: string | null) => ["nearby", origin, town] as const,
  activeTowns: () => ["towns"] as const,
  menu: (restaurantId: string) => ["menu", restaurantId] as const,
} as const;
