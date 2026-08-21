import {
  UtensilsCrossed,
  Flame,
  Sandwich,
  EggFried,
  Cookie,
  CupSoda,
  IceCreamCone,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n";

/**
 * Menu categories, mirroring the `menu_category` enum in
 * supabase/migrations. `Icon` is a real vector component rather than an
 * emoji — emoji vary wildly in style and baseline across Windows, macOS and
 * Android, which looks broken in a filter row where they sit side by side.
 */
export const MENU_CATEGORIES = {
  local: { labelKey: "cat.local", en: "Local food", Icon: UtensilsCrossed },
  grills: { labelKey: "cat.grills", en: "Grills & roast", Icon: Flame },
  fast_food: { labelKey: "cat.fastFood", en: "Fast food", Icon: Sandwich },
  breakfast: { labelKey: "cat.breakfast", en: "Breakfast", Icon: EggFried },
  snacks: { labelKey: "cat.snacks", en: "Snacks", Icon: Cookie },
  drinks: { labelKey: "cat.drinks", en: "Drinks", Icon: CupSoda },
  desserts: { labelKey: "cat.desserts", en: "Desserts", Icon: IceCreamCone },
} as const satisfies Record<string, { labelKey: TKey; en: string; Icon: LucideIcon }>;

export type MenuCategory = keyof typeof MENU_CATEGORIES;

export const MENU_CATEGORY_KEYS = Object.keys(MENU_CATEGORIES) as MenuCategory[];

export function categoryLabelEn(category: MenuCategory) {
  return MENU_CATEGORIES[category].en;
}

/**
 * Search suggestions on the landing page. These are the dishes people
 * actually type — starting someone off with "Ugali" is far more useful than
 * an empty box, and it doubles as a hint that search is by dish, not by
 * restaurant.
 */
export const POPULAR_DISHES = [
  "Ugali",
  "Chips mayai",
  "Pilau",
  "Wali maharage",
  "Nyama choma",
  "Chapati",
  "Mishkaki",
  "Samaki",
] as const;
