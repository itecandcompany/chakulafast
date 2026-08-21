import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import type { RestaurantMapProps, MapRestaurant } from "./RestaurantMapInner";

// RestaurantMapInner pulls in react-leaflet/leaflet, which touch `window` at
// module scope. That module must therefore never be *evaluated* on the server
// — but the generated route tree statically imports every route module, so it
// unavoidably ends up in the SSR module graph.
//
// The split below keeps the two apart:
//   - `import.meta.env.SSR` is a build-time constant, so the SSR bundle takes
//     the first branch and the dynamic import is never reached. Leaflet is
//     resolved but never executed on the server.
//   - `import.meta.glob` (rather than a bare `import()` of a variable) is what
//     Vite can statically analyse and content-hash for the client build.
//
// Note the filename: it is deliberately NOT `RestaurantMap.client.tsx`.
// TanStack Start's import-protection plugin denies `**/*.client.*` anywhere in
// the server module graph, and it runs during resolution — before the dead
// branch above can be eliminated — so the `.client.` suffix fails the SSR
// render of every route that imports this, however unreachable the import is.
//
// It must also not be `import(/* @vite-ignore */ …)`: that suppresses Vite's
// own rewriting, so the browser requests a literal unhashed path that only
// exists in dev, 404s in production, and takes the page down with the rejected
// lazy-load promise.
const Inner = lazy(async (): Promise<{ default: ComponentType<RestaurantMapProps> }> => {
  if (import.meta.env.SSR) return { default: () => null };
  const clientModules = import.meta.glob<typeof import("./RestaurantMapInner")>(
    "./RestaurantMapInner.tsx",
  );
  return clientModules["./RestaurantMapInner.tsx"]();
});

export type { RestaurantMapProps, MapRestaurant };

export default function RestaurantMap(props: RestaurantMapProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const height = props.height ?? 320;

  if (!mounted) {
    return <div className="overflow-hidden rounded-2xl border bg-muted/30" style={{ height }} />;
  }

  return (
    <Suspense
      fallback={
        <div className="overflow-hidden rounded-2xl border bg-muted/30" style={{ height }} />
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}
