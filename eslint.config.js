import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Vercel-preset build output (`npm run build` locally reproduces this
      // dir even though `.vercel` is gitignored) — without excluding it,
      // ESLint chews through the entire generated/bundled JS output and
      // reports prettier noise against code nobody wrote by hand.
      ".vercel",
      "src/integrations/supabase/types.ts",
      "src/routeTree.gen.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // `allowConstantExport` is what lets TanStack Router's mandatory
      // `export const Route = createFileRoute(...)` sit alongside the route's
      // component without every route file warning.
      //
      // Do NOT add `allowExportNames: ["Route"]` here: it looks like the more
      // precise option, but it reclassifies the file as having no component
      // export and the rule then fires on all 21 routes instead. Related:
      // eslint-plugin-react-refresh is held at ^0.4 in package.json — 0.5
      // flags this same framework pattern no matter how the rule is
      // configured.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
