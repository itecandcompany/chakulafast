import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Receipt, User, ShoppingBag } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import { useCart, useCartHydrated, cartItemCount } from "@/lib/cart";

const TABS = [
  { key: "nav.home", url: "/", icon: Home, exact: true },
  { key: "nav.search", url: "/search", icon: Search },
  { key: "nav.orders", url: "/orders", icon: Receipt },
  { key: "nav.account", url: "/account", icon: User },
] as const satisfies ReadonlyArray<{
  key: TKey;
  url: string;
  icon: typeof Home;
  exact?: boolean;
}>;

/**
 * Primary navigation. Two shapes from one element:
 *   - phone/tablet: bottom tab bar, thumb-reachable, centred with the content
 *   - desktop (lg+): left sidebar rail, so the app uses the screen instead of
 *     stranding a phone-width column in the middle of a wide monitor
 *
 * The basket rides along as a fifth item that only appears when it has
 * something in it — a permanently empty cart tab is dead weight on a screen
 * this narrow.
 */
export default function AppTabBar() {
  const t = useT();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const lines = useCart((s) => s.lines);
  const hydrated = useCartHydrated();
  // Reading the persisted basket before hydration finishes would make the
  // first client render disagree with the server HTML.
  const count = hydrated ? cartItemCount(lines) : 0;

  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[72px] w-full max-w-2xl items-stretch justify-around border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur shadow-[0_-4px_20px_rgba(31,22,17,0.08)] lg:inset-y-0 lg:right-auto lg:mx-0 lg:h-auto lg:w-60 lg:max-w-none lg:flex-col lg:justify-start lg:gap-1 lg:border-t-0 lg:border-r lg:px-3 lg:py-6 lg:shadow-none"
    >
      <Link
        to="/"
        className="hidden lg:mb-4 lg:flex lg:items-center lg:gap-3 lg:px-3"
        aria-label="ChakulaFast home"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-elegant">
          C
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold leading-none">ChakulaFast</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">Order ahead, eat on arrival</p>
        </div>
      </Link>

      {TABS.map((tab) => {
        const active = isActive(tab.url, "exact" in tab && tab.exact);
        return (
          <Link
            key={tab.url}
            to={tab.url}
            aria-current={active ? "page" : undefined}
            aria-label={t(tab.key)}
            className="flex max-w-[96px] flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors active:scale-95 lg:max-w-none lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:hover:bg-muted"
          >
            <div
              className={`grid h-8 w-12 place-items-center rounded-full transition-colors lg:h-9 lg:w-9 ${
                active ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="h-5 w-5" />
            </div>
            <span
              className={`text-[11px] leading-none lg:text-sm ${
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {t(tab.key)}
            </span>
          </Link>
        );
      })}

      {count > 0 && (
        <Link
          to="/cart"
          aria-label={`${t("cart.title")} (${count})`}
          className="flex max-w-[96px] flex-1 flex-col items-center justify-center gap-1 rounded-lg transition-colors active:scale-95 lg:max-w-none lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:hover:bg-muted"
        >
          <div className="relative grid h-8 w-12 place-items-center rounded-full text-muted-foreground lg:h-9 lg:w-9">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground lg:right-0 lg:top-0">
              {count}
            </span>
          </div>
          <span className="text-[11px] leading-none text-muted-foreground lg:text-sm">
            {t("cart.title")}
          </span>
        </Link>
      )}
    </nav>
  );
}
