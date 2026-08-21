import { useEffect, useState } from "react";

/**
 * A clock that re-renders on a tick.
 *
 * Countdowns ("ready in 8 min", "start cooking in 2 min") are derived from
 * timestamps, so nothing re-renders on its own as time passes — without this
 * a kitchen ticket would stay frozen at whatever it said when it mounted.
 *
 * Every route that uses this is `ssr: false` (they're all personal dashboards
 * behind a session), so seeding from the real clock can't cause a hydration
 * mismatch — there is no server-rendered frame to disagree with.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
