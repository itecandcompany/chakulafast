import { useCallback, useEffect, useState } from "react";
import { getCurrentPosition } from "@/lib/geo";
import { DEFAULT_TOWN, findTown, nearestTown, TOWNS } from "@/lib/towns";

const TOWN_KEY = "chakulafast.town";

export type DiscoveryLocation = {
  /** Town the customer is browsing, always set — the manual fallback. */
  town: string;
  /** Live GPS fix, when they've granted it. */
  position: { lat: number; lng: number } | null;
  /** What distances are measured from: the GPS fix, else the town centre. */
  origin: { lat: number; lng: number };
  locating: boolean;
  /** True once the persisted town has been read — see the note below. */
  ready: boolean;
  setTown: (town: string) => void;
  requestPosition: () => Promise<boolean>;
  clearPosition: () => void;
};

/**
 * Where the customer is, for the purposes of "near me".
 *
 * Two sources, in priority order: a real GPS fix if they've allowed it, and
 * otherwise the centre of a town they picked by hand. The brief calls for
 * both, and the fallback is not a nicety — location permission gets declined
 * often enough that a discovery page which only works with GPS is a discovery
 * page that often doesn't work.
 *
 * Geolocation is never requested automatically. A permission prompt that
 * appears before the visitor has asked for anything is the fastest way to get
 * a permanent "block", which would break the feature for good.
 */
export function useDiscoveryLocation(): DiscoveryLocation {
  // Starts at the default so server and first client render agree; the stored
  // preference is applied in an effect, guarded by `ready` so callers can
  // avoid firing a query against the wrong town first.
  const [town, setTownState] = useState<string>(DEFAULT_TOWN);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TOWN_KEY);
      if (stored) setTownState(stored);
    } catch {
      // Blocked storage — the default town is a fine answer.
    }
    setReady(true);
  }, []);

  const setTown = useCallback((next: string) => {
    setTownState(next);
    // Choosing a town by hand is an explicit override of any GPS fix,
    // otherwise the list would keep sorting by a distance the customer just
    // told us to ignore.
    setPosition(null);
    try {
      window.localStorage.setItem(TOWN_KEY, next);
    } catch {
      // Preference just won't persist.
    }
  }, []);

  const requestPosition = useCallback(async () => {
    setLocating(true);
    try {
      const fix = await getCurrentPosition();
      if (!fix) return false;
      setPosition(fix);
      // Keep the visible town label honest about where the customer is.
      const near = nearestTown(fix);
      if (near) {
        setTownState(near.name);
        try {
          window.localStorage.setItem(TOWN_KEY, near.name);
        } catch {
          // As above.
        }
      }
      return true;
    } finally {
      setLocating(false);
    }
  }, []);

  const clearPosition = useCallback(() => setPosition(null), []);

  const townCentre = findTown(town) ?? TOWNS[0];
  const origin = position ?? { lat: townCentre.lat, lng: townCentre.lng };

  return { town, position, origin, locating, ready, setTown, requestPosition, clearPosition };
}
