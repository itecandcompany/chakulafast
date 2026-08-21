import { useState } from "react";
import { toast } from "sonner";
import { useCart, type CartLine, type CartRestaurant } from "@/lib/cart";

export type PendingAdd = {
  restaurant: CartRestaurant;
  line: Omit<CartLine, "qty">;
  qty: number;
};

/**
 * Adding a dish, including the one case that isn't a straight add: the
 * basket already belongs to a different kitchen.
 *
 * Rather than silently clearing the basket (destructive and surprising) or
 * refusing outright (a dead end), the conflict is handed back to the caller
 * to confirm. Pair with <CartConflictDialog />, which renders the prompt.
 */
export function useAddToCart() {
  const add = useCart((s) => s.add);
  const replaceWith = useCart((s) => s.replaceWith);
  const currentRestaurant = useCart((s) => s.restaurant);
  const [pending, setPending] = useState<PendingAdd | null>(null);

  const addToCart = (restaurant: CartRestaurant, line: Omit<CartLine, "qty">, qty = 1): boolean => {
    const result = add(restaurant, line, qty);
    if (!result.ok) {
      setPending({ restaurant, line, qty });
      return false;
    }
    toast.success(`${line.name} added`);
    return true;
  };

  const confirmReplace = () => {
    if (!pending) return;
    replaceWith(pending.restaurant, pending.line, pending.qty);
    toast.success(`${pending.line.name} added`);
    setPending(null);
  };

  return {
    addToCart,
    pending,
    currentRestaurant,
    confirmReplace,
    cancelReplace: () => setPending(null),
  };
}
