import type { LocationFailure } from "@/lib/geo";
import type { TKey } from "@/lib/i18n";

/**
 * Maps a geolocation failure to the line shown to the customer.
 *
 * Every one of these ends by pointing at the manual area picker: location is
 * an accelerant here, never a requirement, and a dead end would be a worse
 * failure than the missing fix.
 */
export const LOCATION_ERROR_KEY: Record<LocationFailure, TKey> = {
  denied: "loc.denied",
  timeout: "loc.timeout",
  unavailable: "loc.unavailable",
  unsupported: "loc.unsupported",
  insecure: "loc.insecure",
};
