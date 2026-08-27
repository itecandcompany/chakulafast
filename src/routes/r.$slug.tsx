import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Navigation,
  Phone,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppTabBar from "@/components/AppTabBar";
import CartConflictDialog from "@/components/customer/CartConflictDialog";
import { StarRating } from "@/components/StarRating";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatKm, formatTsh, haversineKm } from "@/lib/geo";
import { DAY_NAMES, formatTimeRange, normalizeWeek, tanzaniaNow, type DayHours } from "@/lib/hours";
import { useT } from "@/lib/i18n";
import { MENU_CATEGORIES, MENU_CATEGORY_KEYS, type MenuCategory } from "@/lib/menuCategories";
import { useCart, cartItemCount, useCartHydrated } from "@/lib/cart";
import { useAddToCart } from "@/hooks/useAddToCart";
import { useDiscoveryLocation } from "@/hooks/useDiscoveryLocation";
import type { Database } from "@/integrations/supabase/types";

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];
type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type Review = Database["public"]["Functions"]["restaurant_reviews"]["Returns"][number];

export const Route = createFileRoute("/r/$slug")({ component: RestaurantPage });

function RestaurantPage() {
  const { slug } = Route.useParams();
  const t = useT();
  const navigate = useNavigate();
  const cart = useAddToCart();
  const locationCtx = useDiscoveryLocation();

  const cartLines = useCart((s) => s.lines);
  const cartHydrated = useCartHydrated();
  const cartCount = cartHydrated ? cartItemCount(cartLines) : 0;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [hours, setHours] = useState<DayHours[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // RLS only exposes active restaurants to the public, so a pending or
        // suspended listing simply looks like a 404 here — which is the
        // behaviour we want.
        const { data: place, error: placeError } = await supabase
          .from("restaurants")
          .select("*")
          .eq("slug", slug)
          .maybeSingle();

        if (placeError) throw placeError;
        if (!place) {
          if (!cancelled) setError("notfound");
          return;
        }
        if (cancelled) return;
        setRestaurant(place);

        const [menuRes, hoursRes, openRes, reviewRes] = await Promise.all([
          supabase
            .from("menu_items")
            .select("*")
            .eq("restaurant_id", place.id)
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("restaurant_hours")
            .select("day_of_week, opens_at, closes_at, is_closed")
            .eq("restaurant_id", place.id),
          supabase.rpc("is_restaurant_open", { _restaurant_id: place.id }),
          supabase.rpc("restaurant_reviews", { _restaurant_id: place.id, _limit: 20 }),
        ]);

        if (cancelled) return;
        setMenu(menuRes.data ?? []);
        setHours(normalizeWeek((hoursRes.data ?? []) as DayHours[]));
        setIsOpen(Boolean(openRes.data));
        setReviews((reviewRes.data ?? []) as Review[]);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, "Couldn't load this restaurant."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const distanceKm = useMemo(() => {
    if (!restaurant || !locationCtx.position) return null;
    return haversineKm(locationCtx.position, { lat: restaurant.lat, lng: restaurant.lng });
  }, [restaurant, locationCtx.position]);

  const grouped = useMemo(() => {
    const byCategory = new Map<MenuCategory, MenuItem[]>();
    for (const item of menu) {
      const key = item.category as MenuCategory;
      const list = byCategory.get(key);
      if (list) list.push(item);
      else byCategory.set(key, [item]);
    }
    // Iterate the canonical order so the menu reads the same at every
    // restaurant, rather than in whatever order dishes happened to be added.
    return MENU_CATEGORY_KEYS.filter((key) => byCategory.has(key)).map((key) => ({
      category: key,
      items: byCategory.get(key)!,
    }));
  }, [menu]);

  const readyOnTimePercent = useMemo(() => {
    const answered = reviews.filter((r) => r.was_ready_on_time !== null);
    if (answered.length === 0) return null;
    const onTime = answered.filter((r) => r.was_ready_on_time).length;
    return Math.round((onTime / answered.length) * 100);
  }, [reviews]);

  const today = tanzaniaNow().dayOfWeek;

  const addItem = (item: MenuItem) => {
    if (!restaurant) return;
    cart.addToCart(
      {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        lat: restaurant.lat,
        lng: restaurant.lng,
        address: restaurant.address,
        town: restaurant.town,
      },
      {
        menuItemId: item.id,
        name: item.name,
        unitPrice: Number(item.price),
        prepMinutes: item.prep_minutes,
        photoUrl: item.photo_url,
      },
    );
  };

  if (loading) {
    return (
      <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
        <Skeleton className="h-44 w-full rounded-none" />
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
        <AppTabBar />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="grid min-h-[var(--app-100vh)] place-items-center bg-background px-4 pb-24 lg:pl-60">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-xl font-bold">
            {error === "notfound" ? "Restaurant not found" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error === "notfound"
              ? "This listing may have been removed, or it isn't active yet."
              : error}
          </p>
          <Button asChild className="mt-4">
            <Link to="/search" search={{}}>
              {t("nav.search")}
            </Link>
          </Button>
        </div>
        <AppTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-28 lg:pb-8 lg:pl-60">
      {/* ---------- Cover ---------- */}
      <header className="relative">
        <div className="h-40 w-full overflow-hidden bg-gradient-hero sm:h-52">
          {restaurant.cover_url && (
            <img src={restaurant.cover_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <Button
          variant="secondary"
          size="icon"
          onClick={() => navigate({ to: "/search", search: {} })}
          aria-label={t("common.back")}
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] h-9 w-9 rounded-full shadow-card"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </header>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-10">
        <div className="-mt-10 flex items-end gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted shadow-card">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground">
                <UtensilsCrossed className="h-7 w-7" />
              </span>
            )}
          </div>
          <span
            className={`mb-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isOpen ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {isOpen ? t("common.open") : t("common.closed")}
          </span>
        </div>

        <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight">
          {restaurant.name}
        </h1>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {restaurant.rating_count > 0 && (
            <StarRating
              value={Number(restaurant.rating)}
              count={restaurant.rating_count}
              size="md"
            />
          )}
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {restaurant.address}
            {formatKm(distanceKm) ? ` · ${formatKm(distanceKm)}` : ""}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {t("restaurant.prepTime", { count: restaurant.avg_prep_minutes })}
          </span>
        </div>

        {readyOnTimePercent !== null && (
          <p className="mt-2 inline-block rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            {t("restaurant.readyOnTime", { percent: readyOnTimePercent })}
          </p>
        )}

        {!restaurant.is_accepting_orders && (
          <p className="mt-3 rounded-xl bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            {t("restaurant.notAccepting")}
          </p>
        )}
        {restaurant.is_accepting_orders && !isOpen && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("restaurant.closedNow")}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="h-9">
            {/* OpenStreetMap rather than a proprietary maps deep link: it
                opens in every browser and needs no app installed. */}
            <a
              href={`https://www.openstreetmap.org/directions?to=${restaurant.lat}%2C${restaurant.lng}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Navigation className="h-3.5 w-3.5" />
              {t("restaurant.directions")}
            </a>
          </Button>
          {restaurant.phone && (
            <Button asChild variant="outline" size="sm" className="h-9">
              <a href={`tel:${restaurant.phone}`}>
                <Phone className="h-3.5 w-3.5" />
                {restaurant.phone}
              </a>
            </Button>
          )}
        </div>

        <Tabs defaultValue="menu" className="mt-5">
          <TabsList className="w-full">
            <TabsTrigger value="menu" className="flex-1">
              {t("restaurant.menu")}
            </TabsTrigger>
            <TabsTrigger value="about" className="flex-1">
              {t("restaurant.about")}
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex-1">
              {t("restaurant.reviews")}
            </TabsTrigger>
          </TabsList>

          {/* ---------- Menu ---------- */}
          <TabsContent value="menu" className="space-y-6 pt-4">
            {grouped.length === 0 && (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t("restaurant.emptyMenu")}
              </p>
            )}

            {grouped.map(({ category, items }) => {
              const meta = MENU_CATEGORIES[category];
              return (
                <section key={category}>
                  <h2 className="flex items-center gap-2 font-display text-base font-bold">
                    <meta.Icon className="h-4 w-4 text-primary" />
                    {t(meta.labelKey)}
                  </h2>
                  <div className="mt-2 space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex gap-3 rounded-2xl border bg-card p-3 ${
                          item.is_available ? "" : "opacity-60"
                        }`}
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                          {item.photo_url ? (
                            <img
                              src={item.photo_url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-muted-foreground">
                              <UtensilsCrossed className="h-5 w-5" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold leading-tight">{item.name}</h3>
                            <p className="shrink-0 font-display font-bold text-primary">
                              {formatTsh(Number(item.price))}
                            </p>
                          </div>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {t("common.minutes", { count: item.prep_minutes })}
                            </span>
                            {item.is_available ? (
                              <Button
                                size="sm"
                                className="h-8 px-3"
                                disabled={!restaurant.is_accepting_orders}
                                onClick={() => addItem(item)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {t("restaurant.add")}
                              </Button>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {t("restaurant.outOfStock")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </TabsContent>

          {/* ---------- About ---------- */}
          <TabsContent value="about" className="space-y-5 pt-4">
            {restaurant.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {restaurant.description}
              </p>
            )}

            <section>
              <h2 className="font-display text-base font-bold">{t("restaurant.hours")}</h2>
              <dl className="mt-2 divide-y rounded-2xl border bg-card">
                {hours.map((day) => (
                  <div
                    key={day.day_of_week}
                    className={`flex items-center justify-between px-3 py-2 text-sm ${
                      day.day_of_week === today ? "font-semibold" : ""
                    }`}
                  >
                    <dt>{DAY_NAMES[day.day_of_week]}</dt>
                    <dd className={day.is_closed ? "text-muted-foreground" : ""}>
                      {formatTimeRange(day)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </TabsContent>

          {/* ---------- Reviews ---------- */}
          <TabsContent value="reviews" className="space-y-3 pt-4">
            {reviews.length === 0 && (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                {t("restaurant.noReviews")}
              </p>
            )}
            {reviews.map((review) => (
              <article key={review.id} className="rounded-2xl border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {review.reviewer_first_name || "Customer"}
                  </span>
                  <StarRating value={review.stars} />
                </div>
                {review.was_ready_on_time !== null && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      review.was_ready_on_time ? "text-success" : "text-warning"
                    }`}
                  >
                    {review.was_ready_on_time ? t("review.yes") : t("review.no")}
                  </p>
                )}
                {review.comment && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{review.comment}</p>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {new Date(review.created_at).toLocaleDateString()}
                </p>
              </article>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky basket bar — sits above the tab bar so the next step is
          always one tap away while scrolling a long menu. */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-[72px] z-40 mx-auto max-w-2xl px-4 pb-2 lg:bottom-4 lg:left-60 lg:mx-auto lg:max-w-md">
          <Button asChild size="lg" className="h-12 w-full shadow-elegant">
            <Link to="/cart">
              <ShoppingBag className="h-4 w-4" />
              {t("cart.title")} · {t("order.items", { count: cartCount })}
            </Link>
          </Button>
        </div>
      )}

      <CartConflictDialog
        pending={cart.pending}
        currentRestaurant={cart.currentRestaurant}
        onConfirm={cart.confirmReplace}
        onCancel={cart.cancelReplace}
      />
      <AppTabBar />
    </div>
  );
}
