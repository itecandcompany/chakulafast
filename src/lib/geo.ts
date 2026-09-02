// Haversine distance in km
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough travel time for a customer heading to a restaurant.
 *
 * 20 km/h is deliberately pessimistic for a Tanzanian town centre — it lands
 * between walking and a boda-boda in traffic. Being a few minutes early is a
 * customer waiting; being a few minutes late is food going cold, so the
 * estimate errs towards the former.
 */
export function etaMinutes(km: number, avgKmh = 20) {
  return Math.max(1, Math.round((km / avgKmh) * 60));
}

// Moshi, Kilimanjaro — the launch town.
export const DEFAULT_CENTER = { lat: -3.3349, lng: 37.3403 };

// Search radius options offered in the filter bar, in km.
export const RADIUS_OPTIONS = [1, 3, 5, 10, 25] as const;

// How close the customer has to be before the kitchen gets the "arriving
// soon" flag on the ticket.
export const ARRIVING_SOON_MINUTES = 5;

export function formatTsh(n: number) {
  return new Intl.NumberFormat("en-TZ", { maximumFractionDigits: 0 }).format(n) + " TSh";
}

export function formatKm(km: number | null | undefined) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/**
 * Why a location attempt didn't produce a fix.
 *
 * None of these are errors in the "something broke" sense — a declined
 * permission is a completely normal outcome. They exist so the UI can say
 * which one happened and point at the manual town picker, instead of
 * spinning on "Finding you…" with nothing to offer.
 */
export type LocationFailure = "unsupported" | "insecure" | "denied" | "timeout" | "unavailable";

export type LocationResult =
  { ok: true; position: { lat: number; lng: number } } | { ok: false; reason: LocationFailure };

/**
 * Geolocation is only available on a secure origin.
 *
 * Browsers treat localhost as secure, but a phone testing against a dev server
 * over the LAN (`http://192.168.x.x:5173`) is not — and there `navigator.
 * geolocation` still *exists*, it just never succeeds. Detecting it up front is
 * the difference between an explanation and a spinner that never stops.
 */
function isSecureForGeolocation(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

/**
 * One-shot browser geolocation that is guaranteed to settle.
 *
 * The `timeout` option is not enough on its own: per the Geolocation spec its
 * clock only starts once the user has answered the permission prompt. If the
 * prompt is ignored — or swiped away on a phone without choosing, which is
 * extremely common — neither callback ever fires and the caller waits forever.
 * That is exactly the "stuck on Finding you…" symptom.
 *
 * So the browser timeout is kept (it is the one that reports a genuine GPS
 * fix failure) and wrapped in a wall-clock race that always resolves.
 */
export function requestLocation(timeoutMs = 10_000): Promise<LocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  if (!isSecureForGeolocation()) {
    return Promise.resolve({ ok: false, reason: "insecure" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: LocationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(wall);
      resolve(result);
    };

    // The wall clock. Deliberately a little longer than the browser's own
    // timeout so a real GPS failure reports its own reason first.
    const wall = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs + 2000);

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish({ ok: true, position: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) =>
        finish({
          ok: false,
          reason:
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
        }),
      // `enableHighAccuracy` asks for GPS rather than the network fix. On a
      // phone indoors that can take 20+ seconds or never resolve, and for
      // "which kitchens are near me" a coarse fix is entirely good enough.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/**
 * Back-compat wrapper: resolves to a position or null, never rejects, and can
 * no longer hang. Callers that want to explain *why* it failed should use
 * requestLocation() instead.
 */
export async function getCurrentPosition(
  timeoutMs = 10_000,
): Promise<{ lat: number; lng: number } | null> {
  const result = await requestLocation(timeoutMs);
  return result.ok ? result.position : null;
}

// ----- OSRM routing (free, no API key) -----
// Returns route geometry (lat,lng pairs), distance (km) and duration (minutes)
export type RouteResult = {
  coords: [number, number][];
  km: number;
  minutes: number;
};

const ROUTE_CACHE_TTL_MS = 20_000;
const routeCache = new Map<string, { at: number; res: RouteResult }>();

// Cache keys are rounded to ~11m, so a GPS-driven caller (route re-fetched
// every few seconds while the customer is en route) produces a near-constant
// stream of new keys — entries would only ever be added, never evicted, so a
// long session grows this Map without bound. Sweep expired entries whenever
// we're about to add a new one.
function evictExpiredRoutes() {
  const now = Date.now();
  for (const [key, entry] of routeCache) {
    if (now - entry.at >= ROUTE_CACHE_TTL_MS) routeCache.delete(key);
  }
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<RouteResult | null> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}->${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) return cached.res;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j = await r.json();
    const route = j?.routes?.[0];
    if (!route) return null;
    const coords: [number, number][] = (route.geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng],
    );
    const res: RouteResult = {
      coords,
      km: route.distance / 1000,
      minutes: Math.max(1, Math.round(route.duration / 60)),
    };
    evictExpiredRoutes();
    routeCache.set(key, { at: Date.now(), res });
    return res;
  } catch {
    return null;
  }
}

/**
 * Best available travel-time estimate: real road routing when the public OSRM
 * demo server answers, straight-line fallback when it doesn't. The fallback
 * matters — that server is unmetered and occasionally unavailable, and an
 * arrival estimate is too central to this app to let it depend on a
 * third party staying up.
 */
export async function estimateTravelMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<{ minutes: number; km: number; routed: boolean }> {
  const route = await fetchRoute(from, to, signal);
  if (route) return { minutes: route.minutes, km: route.km, routed: true };
  const km = haversineKm(from, to);
  return { minutes: etaMinutes(km), km, routed: false };
}
