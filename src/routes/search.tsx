import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { Map as MapIcon, List, Search as SearchIcon, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import AppTabBar from "@/components/AppTabBar";
import DishResultCard from "@/components/customer/DishResultCard";
import FilterBar from "@/components/customer/FilterBar";
import CartConflictDialog from "@/components/customer/CartConflictDialog";
import RestaurantMap, { type MapRestaurant } from "@/components/RestaurantMap";
import { useT } from "@/lib/i18n";
import { toUserMessage } from "@/lib/errorMessages";
import { MENU_CATEGORY_KEYS, type MenuCategory } from "@/lib/menuCategories";
import {
  DEFAULT_FILTERS,
  isSortOption,
  searchDishes,
  suggestDish,
  fetchActiveTowns,
  type DishResult,
  type SearchFilters,
} from "@/lib/search";
import { useDiscoveryLocation } from "@/hooks/useDiscoveryLocation";
import { LOCATION_ERROR_KEY } from "@/lib/locationErrors";
import { useAddToCart } from "@/hooks/useAddToCart";

// Filters live in the URL so a result list can be shared, bookmarked and
// restored by the back button — all three matter for a page whose whole job
// is comparing options.
const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  town: z.string().optional().catch(undefined),
  sort: z.string().optional().catch(undefined),
  cat: z.string().optional().catch(undefined),
  // `.catch` rather than a hard parse: a hand-edited or truncated URL should
  // drop the bad filter, not blow the whole results page up.
  km: z.coerce.number().positive().optional().catch(undefined),
  max: z.coerce.number().positive().optional().catch(undefined),
  // Not z.coerce.boolean() — that turns the string "false" into `true`,
  // because every non-empty string is truthy.
  //
  // `.optional()` has to come *after* `.transform()`: from zod 4 a transform
  // applied to an optional produces a required key typed `boolean | undefined`,
  // which makes every `<Link search={...}>` in the app demand an explicit
  // `open`. Wrapping the transform keeps the key genuinely optional.
  open: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/search")({
  validateSearch: (search) => searchSchema.parse(search),
  component: SearchPage,
});

function SearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const params = Route.useSearch();
  const locationCtx = useDiscoveryLocation();
  const cart = useAddToCart();

  const [input, setInput] = useState(params.q ?? "");
  const [results, setResults] = useState<DishResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [towns, setTowns] = useState<string[]>([]);
  const [correctedTo, setCorrectedTo] = useState<string | null>(null);

  // The URL is the single source of truth for the filter state; this just
  // reshapes it into the object the query and the filter bar both speak.
  const filters: SearchFilters = useMemo(
    () => ({
      q: params.q ?? "",
      town: params.town ?? null,
      category: MENU_CATEGORY_KEYS.includes(params.cat as MenuCategory)
        ? (params.cat as MenuCategory)
        : null,
      maxKm: params.km ?? null,
      maxPrice: params.max ?? null,
      openOnly: params.open ?? false,
      sort: isSortOption(params.sort) ? params.sort : DEFAULT_FILTERS.sort,
    }),
    [params],
  );

  const applyFilters = (next: SearchFilters) => {
    navigate({
      to: "/search",
      search: {
        q: next.q.trim() || undefined,
        town: next.town ?? undefined,
        sort: next.sort !== "distance" ? next.sort : undefined,
        cat: next.category ?? undefined,
        km: next.maxKm ?? undefined,
        max: next.maxPrice ?? undefined,
        open: next.openOnly || undefined,
      },
      replace: true,
    });
  };

  useEffect(() => {
    fetchActiveTowns().then((rows) => setTowns(rows.map((r) => r.town)));
  }, []);

  useEffect(() => {
    setInput(params.q ?? "");
  }, [params.q]);

  const { origin, ready } = locationCtx;
  // Distances come from the GPS fix when there is one, otherwise from the
  // centre of the chosen town — so "nearest first" always means something.
  const searchOrigin = locationCtx.position ?? origin;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setResults(null);
    setError(null);

    setCorrectedTo(null);

    searchDishes(filters, searchOrigin)
      .then(async (rows) => {
        if (cancelled) return;
        setResults(rows);

        // Offer a correction only when every hit was approximate — if
        // anything matched exactly, the spelling was fine and the fuzzy
        // extras are a bonus rather than a substitution.
        const allFuzzy = rows.length > 0 && rows.every((r) => r.is_fuzzy_match);
        if (!allFuzzy || !filters.q.trim()) return;

        const suggestion = await suggestDish(filters.q);
        if (
          !cancelled &&
          suggestion &&
          suggestion.toLowerCase() !== filters.q.trim().toLowerCase()
        ) {
          setCorrectedTo(suggestion);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toUserMessage(err, "Couldn't load results."));
        setResults([]);
      });

    return () => {
      cancelled = true;
    };
    // Same reasoning as the landing page: `searchOrigin` is rebuilt on every
    // render, and only its coordinates change what comes back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filters, searchOrigin.lat, searchOrigin.lng]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    applyFilters({ ...filters, q: input });
  };

  // One pin per restaurant, even when several of its dishes matched.
  const mapRestaurants: MapRestaurant[] = useMemo(() => {
    const seen = new Map<string, MapRestaurant>();
    for (const dish of results ?? []) {
      if (seen.has(dish.restaurant_id)) continue;
      seen.set(dish.restaurant_id, {
        id: dish.restaurant_id,
        name: dish.restaurant_name,
        slug: dish.slug,
        lat: dish.lat,
        lng: dish.lng,
        is_open: dish.is_open,
        distance_km: dish.distance_km,
        min_price: dish.price,
      });
    }
    return [...seen.values()];
  }, [results]);

  const addDish = (dish: DishResult) => {
    cart.addToCart(
      {
        id: dish.restaurant_id,
        name: dish.restaurant_name,
        slug: dish.slug,
        lat: dish.lat,
        lng: dish.lng,
        address: dish.address,
        town: dish.town,
      },
      {
        menuItemId: dish.item_id,
        name: dish.item_name,
        unitPrice: Number(dish.price),
        prepMinutes: dish.prep_minutes,
        photoUrl: dish.photo_url,
      },
    );
  };

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="sticky top-0 z-30 border-b bg-background/95 px-4 pb-3 pt-4 backdrop-blur sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl space-y-3">
          <form onSubmit={submit} className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                className="h-11 pl-9"
              />
            </div>
            <Button type="submit" className="h-11 shrink-0">
              {t("landing.searchCta")}
            </Button>
          </form>

          <FilterBar filters={filters} onChange={applyFilters} towns={towns} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 sm:px-6 lg:px-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold">
              {filters.q ? t("search.title", { query: filters.q }) : t("search.titleEmpty")}
            </h1>
            {results && (
              <p className="text-xs text-muted-foreground">
                {t("search.count", { count: results.length })}
                {!locationCtx.position && ` · ${locationCtx.town}`}
              </p>
            )}
            {/* Only shown when *nothing* matched exactly. If some results are
                real matches, correcting the spelling would be wrong — the
                fuzzy extras are a bonus, not a substitution. */}
            {correctedTo && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("search.didYouMean")}{" "}
                <button
                  type="button"
                  onClick={() => applyFilters({ ...filters, q: correctedTo })}
                  className="font-semibold text-primary hover:underline"
                >
                  {correctedTo}
                </button>
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-full border bg-muted p-1">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              aria-label="List view"
              className={`grid h-7 w-8 place-items-center rounded-full transition-colors ${
                view === "list" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              aria-pressed={view === "map"}
              aria-label="Map view"
              className={`grid h-7 w-8 place-items-center rounded-full transition-colors ${
                view === "map" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <MapIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!locationCtx.position && (
          <button
            type="button"
            onClick={locationCtx.requestPosition}
            disabled={locationCtx.locating}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {locationCtx.locating ? t("landing.locating") : t("landing.useMyLocation")}
          </button>
        )}

        {locationCtx.locationError && (
          <p className="mb-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            {t(LOCATION_ERROR_KEY[locationCtx.locationError])}
          </p>
        )}

        {error && (
          <p className="mb-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {view === "map" && results !== null && (
          <RestaurantMap
            center={[searchOrigin.lat, searchOrigin.lng]}
            restaurants={mapRestaurants}
            me={locationCtx.position ? [locationCtx.position.lat, locationCtx.position.lng] : null}
            height={420}
          />
        )}

        {view === "list" && (
          <div className="space-y-3">
            {results === null &&
              [0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[126px] w-full rounded-2xl" />
              ))}

            {/* active_towns() is empty only when the platform has no listed
                restaurant anywhere — a different situation from "your filters
                matched nothing", and telling a customer to loosen filters that
                were never the problem just makes the app look broken. */}
            {results?.length === 0 && towns.length === 0 && (
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <p className="font-medium">{t("empty.noRestaurantsYet")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("empty.noRestaurantsYetHint")}
                </p>
              </div>
            )}

            {results?.length === 0 && towns.length > 0 && (
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <p className="font-medium">{t("search.noResults")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("search.noResultsHint")}</p>
                {filters.maxKm != null && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => applyFilters({ ...filters, maxKm: null })}
                  >
                    {t("filter.anyDistance")}
                  </Button>
                )}
              </div>
            )}

            {results?.map((dish) => (
              <DishResultCard key={dish.item_id} dish={dish} onAdd={addDish} />
            ))}
          </div>
        )}
      </main>

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
