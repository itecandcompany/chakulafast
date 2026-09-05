import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ChefHat, Clock, LocateFixed, MapPin, Search, Store, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AppTabBar from "@/components/AppTabBar";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { StarRating } from "@/components/StarRating";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatKm, formatTsh } from "@/lib/geo";
import { POPULAR_DISHES } from "@/lib/menuCategories";
import { TOWNS } from "@/lib/towns";
import { UPCOMING_FEATURES } from "@/lib/upcoming";
import { fetchActiveTowns, fetchNearbyRestaurants, type NearbyRestaurant } from "@/lib/search";
import { useDiscoveryLocation } from "@/hooks/useDiscoveryLocation";
import { LOCATION_ERROR_KEY } from "@/lib/locationErrors";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const t = useT();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const location = useDiscoveryLocation();
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<NearbyRestaurant[] | null>(null);
  const [towns, setTowns] = useState<string[]>([]);

  const { town, origin, ready } = location;

  useEffect(() => {
    fetchActiveTowns().then((rows) => setTowns(rows.map((r) => r.town)));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setNearby(null);
    fetchNearbyRestaurants(origin, town)
      .then((rows) => {
        if (!cancelled) setNearby(rows);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      });
    return () => {
      cancelled = true;
    };
    // `origin` is a fresh object every render, so depending on it directly
    // would refetch on each one. Its coordinates are the only part that can
    // actually change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, town, origin.lat, origin.lng]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/search", search: { q: query.trim() || undefined, town } });
  };

  const townOptions = towns.length ? towns : TOWNS.map((tw) => tw.name);

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      {/* ---------- Hero ---------- */}
      <header className="safe-top bg-gradient-hero px-4 pb-8 text-primary-foreground [--safe-top-min:2rem] sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-foreground/15 text-base font-bold backdrop-blur">
                C
              </div>
              <span className="font-display text-lg font-extrabold">ChakulaFast</span>
            </div>

            {profile?.role === "restaurant" ? (
              <Button asChild size="sm" variant="secondary" className="h-9">
                <Link to="/vendor">{t("account.myRestaurant")}</Link>
              </Button>
            ) : profile?.role === "admin" ? (
              <Button asChild size="sm" variant="secondary" className="h-9">
                <Link to="/admin">{t("account.adminConsole")}</Link>
              </Button>
            ) : !profile ? (
              <Button asChild size="sm" variant="secondary" className="h-9">
                <Link to="/auth" search={{ role: "customer", mode: "signin" }}>
                  {t("common.signIn")}
                </Link>
              </Button>
            ) : null}
          </div>

          <p className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium backdrop-blur">
            <ChefHat className="h-3.5 w-3.5" />
            {t("landing.badge")}
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
            {t("landing.title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-primary-foreground/85 sm:text-base">
            {t("landing.subtitle")}
          </p>

          <form onSubmit={submitSearch} className="mt-5 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("landing.searchPlaceholder")}
                aria-label={t("landing.searchPlaceholder")}
                className="h-12 bg-background pl-9 text-foreground"
              />
            </div>
            <Button type="submit" size="lg" variant="secondary" className="h-12 shrink-0">
              {t("landing.searchCta")}
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={town} onValueChange={location.setTown}>
              <SelectTrigger
                className="h-9 w-auto rounded-full border-primary-foreground/25 bg-primary-foreground/10 text-xs text-primary-foreground"
                aria-label={t("landing.changeTown")}
              >
                <MapPin className="h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {townOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              type="button"
              onClick={location.requestPosition}
              disabled={location.locating}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 text-xs font-medium backdrop-blur transition-colors hover:bg-primary-foreground/20 disabled:opacity-60"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              {location.locating
                ? t("landing.locating")
                : location.position
                  ? t("landing.usingLocation")
                  : t("landing.useMyLocation")}
            </button>
          </div>

          {/* Location is an accelerant, never a requirement — so a failure
              explains itself and points at the area picker just above. */}
          {location.locationError && (
            <p className="mt-2 rounded-lg bg-primary-foreground/10 px-3 py-2 text-xs text-primary-foreground/90">
              {t(LOCATION_ERROR_KEY[location.locationError])}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6 lg:px-10">
        {/* ---------- Popular dishes ---------- */}
        <section>
          <h2 className="font-display text-lg font-bold">{t("landing.popular")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {POPULAR_DISHES.map((dish) => (
              <Link
                key={dish}
                to="/search"
                search={{ q: dish, town }}
                className="rounded-full border bg-card px-3.5 py-2 text-sm font-medium shadow-card transition-colors hover:border-primary hover:text-primary"
              >
                {dish}
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- Nearby kitchens ---------- */}
        <section>
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-bold">
              {t("landing.nearbyTitle")}{" "}
              <span className="text-muted-foreground">{t("landing.inTown", { town })}</span>
            </h2>
          </div>

          <div className="mt-3 space-y-3">
            {nearby === null &&
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}

            {nearby?.length === 0 && (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {/* Same distinction as the search page: an empty platform is
                    not an empty neighbourhood, and saying so keeps a new
                    launch from reading as a broken app. */}
                {towns.length === 0 ? (
                  <>
                    <p className="font-medium text-foreground">{t("empty.noRestaurantsYet")}</p>
                    <p className="mt-1">{t("empty.noRestaurantsYetHint")}</p>
                  </>
                ) : (
                  <p>{t("landing.nearbyEmpty")}</p>
                )}
              </div>
            )}

            {nearby?.map((r) => (
              <Link
                key={r.id}
                to="/r/$slug"
                params={{ slug: r.slug }}
                className="flex gap-3 rounded-2xl border bg-card p-3 shadow-card transition-shadow hover:shadow-elegant"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {r.logo_url ? (
                    <img
                      src={r.logo_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-muted-foreground">
                      <UtensilsCrossed className="h-6 w-6" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-display text-[15px] font-bold">{r.name}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.is_open ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.is_open ? t("common.open") : t("common.closed")}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{r.address}</p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {formatKm(r.distance_km) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {formatKm(r.distance_km)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {t("restaurant.prepTime", { count: r.avg_prep_minutes })}
                    </span>
                    {r.min_price != null && (
                      <span>
                        {t("common.from")} {formatTsh(Number(r.min_price))}
                      </span>
                    )}
                    {r.rating_count > 0 && (
                      <StarRating value={Number(r.rating)} count={r.rating_count} />
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section>
          <h2 className="font-display text-lg font-bold">{t("landing.howItWorks")}</h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Search, title: t("landing.step1"), body: t("landing.step1Body") },
              { icon: UtensilsCrossed, title: t("landing.step2"), body: t("landing.step2Body") },
              { icon: Clock, title: t("landing.step3"), body: t("landing.step3Body") },
            ].map((step, i) => (
              <li key={step.title} className="rounded-2xl border bg-card p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-2.5 font-display text-sm font-bold">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Coming soon ---------- */}
        <section>
          <h2 className="font-display text-lg font-bold">{t("upcoming.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("upcoming.subtitle")}</p>
          <ul className="mt-3 space-y-2">
            {UPCOMING_FEATURES.map((feature) => (
              <li key={feature.id} className="rounded-2xl border border-dashed bg-card/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{t(feature.title)}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("upcoming.badge")}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t(feature.body)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Vendor CTA ---------- */}
        {profile?.role !== "restaurant" && (
          <section className="overflow-hidden rounded-2xl bg-gradient-primary p-5 text-primary-foreground shadow-elegant">
            <Store className="h-6 w-6" />
            <h2 className="mt-2 font-display text-lg font-bold">{t("landing.vendorCta")}</h2>
            <p className="mt-1 text-sm text-primary-foreground/85">{t("landing.vendorCtaBody")}</p>
            <Button asChild variant="secondary" className="mt-3 h-10">
              <Link to="/auth" search={{ role: "restaurant", mode: "signup" }}>
                {t("landing.vendorCtaButton")}
              </Link>
            </Button>
          </section>
        )}

        <footer className="space-y-4 border-t pt-6">
          <LanguageSwitcher className="max-w-xs" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground hover:underline">
              {t("common.privacy")}
            </Link>
            <span>© {new Date().getFullYear()} ChakulaFast</span>
          </div>
        </footer>
      </main>

      <AppTabBar />
    </div>
  );
}
