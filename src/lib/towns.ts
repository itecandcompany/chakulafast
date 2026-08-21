/**
 * Towns a customer can pick manually when they don't want to share GPS, or
 * when the browser refuses it.
 *
 * This is only the fallback list for the area picker and the map's initial
 * view — a restaurant may register in any town it likes, and `active_towns()`
 * (see the discovery RPC migration) is what the filter actually offers once
 * there is real data. Keeping a static list as well means the picker isn't
 * empty on a brand new database.
 */
export type Town = {
  name: string;
  region: string;
  lat: number;
  lng: number;
};

export const TOWNS = [
  { name: "Moshi", region: "Kilimanjaro", lat: -3.3349, lng: 37.3403 },
  { name: "Arusha", region: "Arusha", lat: -3.3869, lng: 36.683 },
  { name: "Dar es Salaam", region: "Dar es Salaam", lat: -6.7924, lng: 39.2083 },
  { name: "Dodoma", region: "Dodoma", lat: -6.163, lng: 35.7516 },
  { name: "Mwanza", region: "Mwanza", lat: -2.5164, lng: 32.9175 },
  { name: "Tanga", region: "Tanga", lat: -5.0689, lng: 39.0988 },
  { name: "Morogoro", region: "Morogoro", lat: -6.8278, lng: 37.6591 },
  { name: "Mbeya", region: "Mbeya", lat: -8.9094, lng: 33.4608 },
  { name: "Zanzibar City", region: "Zanzibar", lat: -6.1659, lng: 39.2026 },
] as const satisfies ReadonlyArray<Town>;

export type TownName = (typeof TOWNS)[number]["name"];

export const DEFAULT_TOWN: TownName = "Moshi";

export function findTown(name: string | null | undefined): Town | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  return TOWNS.find((t) => t.name.toLowerCase() === needle) ?? null;
}

/**
 * Nearest known town to a coordinate — used to pre-fill the area picker from
 * a GPS fix so the two controls never disagree about where the customer is.
 * Anything further than ~60km from every listed town is treated as "not in a
 * town we know", which is more honest than snapping to a distant one.
 */
export function nearestTown(point: { lat: number; lng: number }, maxKm = 60): Town | null {
  let best: Town | null = null;
  let bestKm = Infinity;
  for (const town of TOWNS) {
    const dLat = ((town.lat - point.lat) * Math.PI) / 180;
    const dLng = ((town.lng - point.lng) * Math.PI) / 180;
    const lat1 = (point.lat * Math.PI) / 180;
    const lat2 = (town.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.sqrt(h));
    if (km < bestKm) {
      bestKm = km;
      best = town;
    }
  }
  return bestKm <= maxKm ? best : null;
}
