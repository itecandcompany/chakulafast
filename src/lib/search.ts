import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { MenuCategory } from "@/lib/menuCategories";

export type DishResult = Database["public"]["Functions"]["search_dishes"]["Returns"][number];
export type NearbyRestaurant =
  Database["public"]["Functions"]["restaurants_nearby"]["Returns"][number];

export const SORT_OPTIONS = ["distance", "price_asc", "price_desc", "rating", "prep"] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export function isSortOption(value: unknown): value is SortOption {
  return typeof value === "string" && (SORT_OPTIONS as readonly string[]).includes(value);
}

export type SearchFilters = {
  q: string;
  town: string | null;
  category: MenuCategory | null;
  maxKm: number | null;
  maxPrice: number | null;
  openOnly: boolean;
  sort: SortOption;
};

export const DEFAULT_FILTERS: SearchFilters = {
  q: "",
  town: null,
  category: null,
  maxKm: null,
  maxPrice: null,
  openOnly: false,
  sort: "distance",
};

/**
 * All the discovery filtering happens in one Postgres function rather than in
 * the browser: the dataset is every dish at every active restaurant, and
 * shipping that down to filter it client-side would not survive contact with
 * a real number of listings.
 *
 * `origin` is whatever the customer's location resolves to — a GPS fix if
 * they shared one, otherwise the centre of the town they picked. Passing null
 * is fine; results simply come back without distances.
 */
export async function searchDishes(
  filters: SearchFilters,
  origin: { lat: number; lng: number } | null,
) {
  const { data, error } = await supabase.rpc("search_dishes", {
    _q: filters.q.trim() || null,
    _lat: origin?.lat ?? null,
    _lng: origin?.lng ?? null,
    _town: filters.town,
    _category: filters.category,
    _max_km: filters.maxKm,
    _max_price: filters.maxPrice,
    _open_only: filters.openOnly,
    _available_only: true,
    _sort: filters.sort,
    _limit: 60,
  });

  if (error) throw error;
  return (data ?? []) as DishResult[];
}

export async function fetchNearbyRestaurants(
  origin: { lat: number; lng: number } | null,
  town: string | null,
  maxKm: number | null = null,
) {
  const { data, error } = await supabase.rpc("restaurants_nearby", {
    _lat: origin?.lat ?? null,
    _lng: origin?.lng ?? null,
    _town: town,
    _max_km: maxKm,
    _open_only: false,
    _limit: 40,
  });

  if (error) throw error;
  return (data ?? []) as NearbyRestaurant[];
}

/**
 * The closest real dish name to what was typed, for the "showing results for
 * ugali" line above a set of fuzzy hits.
 *
 * Returns null rather than throwing: a missing suggestion should quietly drop
 * the correction line, never take the results page down with it.
 */
export async function suggestDish(query: string): Promise<string | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  const { data, error } = await supabase.rpc("suggest_dish", { _q: q });
  if (error) {
    console.error(error);
    return null;
  }
  return data ?? null;
}

/**
 * Towns that actually have a listing. Falls back to an empty array rather
 * than throwing — the area picker always has the static TOWNS list to fall
 * back on, so a failure here should degrade, not break the page.
 */
export async function fetchActiveTowns() {
  const { data, error } = await supabase.rpc("active_towns");
  if (error) {
    console.error(error);
    return [];
  }
  return data ?? [];
}
