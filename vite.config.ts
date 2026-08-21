// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Without an explicit preset the wrapper's nitro/deploy step is skipped
  // outside a Lovable sandbox, leaving a plain Node `server.js` that Vercel
  // has no idea how to route (every page 404s). Forcing the vercel preset
  // makes the deploy build emit `.vercel/output/` instead.
  nitro: {
    preset: "vercel",
  },
  vite: {
    ssr: {
      target: "node",
      // react-leaflet ships ESM that Node can't require during SSR, and the
      // map is client-only anyway (see RestaurantMap.tsx) — but bundling it
      // for the server build keeps nitro from choking on the bare import.
      noExternal: ["react-leaflet", "@react-leaflet/core"],
    },
    build: {
      sourcemap: false,
    },
  },
});
