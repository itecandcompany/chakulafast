/**
 * Service worker registration.
 *
 * Only runs in production builds: in dev, Vite serves unhashed module URLs that
 * a caching service worker would happily serve back stale, which looks exactly
 * like "my edit didn't apply" and is miserable to debug.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  const onLoad = () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            // Only tell it to take over once a previous worker is already in
            // control — on a first install there's nothing to replace, and
            // skipping the wait then would just churn.
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              // Deliberately no forced reload: the new worker takes effect on
              // the next navigation. Reloading here could yank the page out
              // from under someone mid-order.
              incoming.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch(() => {
        // A failed registration must never break the app — offline support is
        // an enhancement, not a requirement.
      });
  };

  window.addEventListener("load", onLoad, { once: true });
  return () => window.removeEventListener("load", onLoad);
}
