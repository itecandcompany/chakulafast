// Simple in-memory sliding window rate limiter keyed by caller.
// Best-effort against an individual abusing an endpoint; does not require any
// shared store, so it is safe in stateless deployments — each instance keeps
// its own counters, which is fine for the abuse it's meant to blunt (one
// person hammering one endpoint) rather than a distributed attack.

type Window = { windowMs: number; max: number; calls: Map<string, number[]> };

const windows = new Map<string, Window>();

export function isRateLimited(
  bucket: string,
  key: string,
  { windowMs = 60_000, max = 30 } = {},
): boolean {
  let win = windows.get(bucket);
  if (!win) {
    win = { windowMs, max, calls: new Map() };
    windows.set(bucket, win);
  }

  const now = Date.now();
  const recent = (win.calls.get(key) ?? []).filter((t) => now - t < win.windowMs);

  if (recent.length >= win.max) {
    win.calls.set(key, recent);
    return true;
  }

  recent.push(now);
  win.calls.set(key, recent);

  // Callers come and go; without this sweep the Map only ever grows.
  if (win.calls.size > 5_000) {
    for (const [k, times] of win.calls) {
      if (times.every((t) => now - t >= win.windowMs)) win.calls.delete(k);
    }
  }

  return false;
}

/** Throws the standard 429 so handlers can stay one-liners. */
export function enforceRateLimit(
  bucket: string,
  key: string,
  opts?: { windowMs?: number; max?: number },
) {
  if (isRateLimited(bucket, key, opts)) {
    throw new Response("Too many requests — please slow down.", { status: 429 });
  }
}
