import { createContext, useContext, type ReactNode } from "react";
import type { Database } from "@/integrations/supabase/types";

export type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

type VendorCtx = {
  restaurant: Restaurant;
  /** Re-reads the listing after an edit, a payment, or an admin action. */
  refresh: () => Promise<void>;
};

const Ctx = createContext<VendorCtx | undefined>(undefined);

/**
 * The vendor layout loads the signed-in owner's restaurant once and shares it
 * with every page beneath it. Doing this per page instead would mean four
 * copies of the same query and four chances for them to disagree about
 * whether the listing is active.
 */
export function VendorProvider({ value, children }: { value: VendorCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVendor() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVendor must be used inside the /vendor layout");
  return ctx;
}

// Unicode combining marks, left over after NFKD decomposition. Built from a
// string rather than written as a regex literal so the source stays pure
// ASCII — a literal combining mark is invisible in an editor and trivially
// mangled by anything that re-encodes the file.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** URL-safe slug from a restaurant name, matching the DB's CHECK constraint. */
// eslint-disable-next-line react-refresh/only-export-components
export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      // "Café" -> "cafe", not "caf".
      .replace(COMBINING_MARKS, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  );
}
