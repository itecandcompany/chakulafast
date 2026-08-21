/**
 * Opening-hours helpers.
 *
 * The database is the authority on whether a kitchen is open right now —
 * `is_restaurant_open()` evaluates it in Africa/Dar_es_Salaam so the answer
 * doesn't depend on the visitor's device clock or timezone. These helpers
 * only format and edit the schedule; where "open now" is displayed, it comes
 * from the `is_open` column returned by the discovery RPCs.
 */

export type DayHours = {
  day_of_week: number;
  opens_at: string; // "HH:MM" or "HH:MM:SS" as Postgres returns it
  closes_at: string;
  is_closed: boolean;
};

// 0 = Sunday, matching both JavaScript's Date#getDay() and the day_of_week
// column, so no remapping is ever needed in either direction.
export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DEFAULT_HOURS: DayHours[] = DAY_NAMES.map((_, day) => ({
  day_of_week: day,
  opens_at: "08:00",
  closes_at: "22:00",
  is_closed: false,
}));

/** Postgres hands back "08:00:00"; the UI and <input type="time"> want "08:00". */
export function toTimeInput(value: string) {
  return value.slice(0, 5);
}

export function formatTimeRange(hours: DayHours) {
  if (hours.is_closed) return "Closed";
  return `${toTimeInput(hours.opens_at)} – ${toTimeInput(hours.closes_at)}`;
}

/**
 * Fills in any weekday the restaurant has no row for. A missing row means
 * closed in the database, and showing a gap in the list would be worse than
 * showing "Closed" explicitly.
 */
export function normalizeWeek(rows: DayHours[]): DayHours[] {
  return DAY_NAMES.map((_, day) => {
    const found = rows.find((r) => r.day_of_week === day);
    return found ?? { day_of_week: day, opens_at: "00:00", closes_at: "00:00", is_closed: true };
  });
}

/**
 * Local time in Tanzania, whatever the device thinks. Used only for display
 * hints (like "closes at 22:00 today"); the authoritative open/closed flag
 * still comes from the database.
 */
export function tanzaniaNow(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  const dayIndex = DAY_SHORT.findIndex((d) => d.toLowerCase() === weekday.toLowerCase());

  return {
    time: `${get("hour")}:${get("minute")}`,
    dayOfWeek: dayIndex === -1 ? now.getDay() : dayIndex,
  };
}

/**
 * "Ready at about 13:45" — the clock time a customer should expect, rendered
 * in Tanzanian local time for the same reason as above.
 */
export function formatClock(at: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(at));
}
