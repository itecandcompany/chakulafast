import { supabase } from "@/integrations/supabase/client";

export type KitchenSlot = {
  available: boolean;
  /** 0 means the kitchen has not opted into capacity limits. */
  capacity: number;
  busy: number;
  /**
   * Minutes from now at which the kitchen can genuinely have this food hot.
   * null means fully booked for the next four hours.
   */
  suggestedMinutes: number | null;
};

/**
 * Asks the kitchen whether it can cook this basket for the requested arrival.
 *
 * Returning null on failure is deliberate. This is advice used to offer the
 * customer a better time; the INSERT trigger is what actually enforces
 * capacity. So if the check itself breaks, the right move is to let the order
 * through to the rule that can't be bypassed, rather than block a sale over a
 * failed advisory.
 */
export async function checkKitchenSlot(
  restaurantId: string,
  prepMinutes: number,
  arrivalMinutes: number,
): Promise<KitchenSlot | null> {
  const { data, error } = await supabase.rpc("check_kitchen_slot", {
    _restaurant: restaurantId,
    _prep_minutes: prepMinutes,
    _arrival_minutes: arrivalMinutes,
  });

  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return {
    available: row.available,
    capacity: row.capacity,
    busy: row.busy,
    suggestedMinutes: row.suggested_minutes,
  };
}

/** The database raises this when the last slot went to someone else mid-checkout. */
export function isKitchenFullError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.includes("KITCHEN_FULL");
}

/**
 * "in 20 minutes" as a clock time the customer can actually plan around.
 *
 * A kitchen quoting "35 minutes" is asking someone to do arithmetic while
 * standing on a street; "13:20" is the thing they'll set an alarm for.
 */
export function arrivalClock(minutesFromNow: number): string {
  const at = new Date(Date.now() + minutesFromNow * 60_000);
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
