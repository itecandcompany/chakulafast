import { useEffect, useState } from "react";

/**
 * Delays a fast-changing value so it can be used in a query key.
 *
 * Search boxes on the admin tables now filter in Postgres rather than in the
 * browser, which means every keystroke would otherwise be a round trip. 300ms
 * is long enough to swallow a burst of typing and short enough that nobody
 * notices waiting.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return settled;
}
