/**
 * ChakulaFast service worker.
 *
 * Deliberately conservative: a service worker that caches too eagerly is far
 * worse than none at all, because stale responses persist across deploys and
 * users have no obvious way to clear them. So:
 *
 *   - only same-origin GETs are touched. Supabase REST/realtime, OSM map tiles
 *     and Google Fonts all go straight to the network, always.
 *   - navigations are network-first, so a fresh deploy is picked up immediately;
 *     the cache is only a fallback for being offline.
 *   - build assets are content-hashed by Vite, so they're safe to serve
 *     cache-first while revalidating in the background.
 *
 * Bump VERSION to evict every previous cache on the next activate.
 */
const VERSION = "chakulafast-v1";
const CACHE = `${VERSION}-shell`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icon-192.png", "/favicon-32.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `cache: "reload"` bypasses the HTTP cache so a stale copy of the
      // offline page can't be baked in at install time.
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Lets the page trigger an immediate update instead of waiting for all tabs
// to close (see registerServiceWorker in src/lib/pwa.ts).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (
            (await caches.match(req)) ??
            (await caches.match(OFFLINE_URL)) ??
            new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
          );
        }
      })(),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    /\.(?:css|js|mjs|png|svg|ico|webmanifest|woff2?)$/.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached ?? (await network) ?? new Response("", { status: 504 });
    })(),
  );
});
