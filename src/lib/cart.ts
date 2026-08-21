import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";

/** Stands in for localStorage during SSR, where there isn't one. */
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * The basket.
 *
 * One restaurant at a time, by design: a pre-order is a promise to one
 * kitchen about one arrival time, and there is no delivery rider to
 * consolidate two of them. `add()` therefore reports a conflict rather than
 * silently mixing kitchens, and the caller confirms with the customer before
 * calling `replaceWith()`.
 *
 * Persisted to localStorage so closing the tab on the way to the restaurant
 * doesn't lose the order. Anything that renders from it must wait for
 * `useCartHydrated()` — reading persisted state during the first render
 * would disagree with the server-rendered HTML and break hydration.
 */
export type CartLine = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  prepMinutes: number;
  qty: number;
  photoUrl: string | null;
};

export type CartRestaurant = {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  address: string;
  town: string;
};

type AddResult = { ok: true } | { ok: false; conflictWith: CartRestaurant };

type CartState = {
  restaurant: CartRestaurant | null;
  lines: CartLine[];
  add: (restaurant: CartRestaurant, line: Omit<CartLine, "qty">, qty?: number) => AddResult;
  replaceWith: (restaurant: CartRestaurant, line: Omit<CartLine, "qty">, qty?: number) => void;
  setQty: (menuItemId: string, qty: number) => void;
  remove: (menuItemId: string) => void;
  clear: () => void;
};

function upsert(lines: CartLine[], line: Omit<CartLine, "qty">, qty: number): CartLine[] {
  const existing = lines.find((l) => l.menuItemId === line.menuItemId);
  if (!existing) return [...lines, { ...line, qty }];
  return lines.map((l) =>
    l.menuItemId === line.menuItemId ? { ...l, qty: Math.min(50, l.qty + qty) } : l,
  );
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      restaurant: null,
      lines: [],

      add: (restaurant, line, qty = 1) => {
        const current = get().restaurant;
        if (current && current.id !== restaurant.id && get().lines.length > 0) {
          return { ok: false, conflictWith: current };
        }
        set({ restaurant, lines: upsert(get().lines, line, qty) });
        return { ok: true };
      },

      replaceWith: (restaurant, line, qty = 1) => {
        set({ restaurant, lines: [{ ...line, qty }] });
      },

      setQty: (menuItemId, qty) => {
        if (qty <= 0) {
          get().remove(menuItemId);
          return;
        }
        set({
          lines: get().lines.map((l) =>
            l.menuItemId === menuItemId ? { ...l, qty: Math.min(50, qty) } : l,
          ),
        });
      },

      remove: (menuItemId) => {
        const lines = get().lines.filter((l) => l.menuItemId !== menuItemId);
        // Dropping the last line also drops the restaurant, otherwise an
        // empty basket would still block adding a dish from somewhere else.
        set({ lines, restaurant: lines.length ? get().restaurant : null });
      },

      clear: () => set({ restaurant: null, lines: [] }),
    }),
    {
      name: "chakulafast.cart",
      // `localStorage` is a bare global that throws a ReferenceError when
      // touched during SSR, which takes the whole server render down with it.
      // Handing persist a no-op store on the server keeps the basket a
      // client-only concern without special-casing every component that reads
      // it — the real store takes over on hydration.
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({ restaurant: state.restaurant, lines: state.lines }),
    },
  ),
);

export function cartSubtotal(lines: CartLine[]) {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}

export function cartItemCount(lines: CartLine[]) {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/**
 * The slowest dish decides when cooking must start — a 5-minute soda
 * alongside a 40-minute grill is ready in 40, not 45.
 */
export function cartPrepMinutes(lines: CartLine[]) {
  return lines.reduce((max, l) => Math.max(max, l.prepMinutes), 0);
}

/**
 * True once the persisted basket has been merged into the store.
 *
 * Always starts `false`, including on the server: the server has no basket to
 * read, so anything derived from one must render empty first and fill in after
 * hydration. Seeding from the store instead would make the first client render
 * disagree with the server HTML.
 */
export function useCartHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useCart.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useCart.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
