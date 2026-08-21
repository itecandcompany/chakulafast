import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Plus, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/StarRating";
import { formatKm, formatTsh } from "@/lib/geo";
import { useT } from "@/lib/i18n";
import type { DishResult } from "@/lib/search";

/**
 * One search hit: the dish, its price at *this* kitchen, how far away that
 * kitchen is and how long it takes to cook.
 *
 * The four facts are laid out in that order deliberately — it's the exact
 * comparison someone is making when they search "ugali" and get eleven
 * results back, and putting price and distance on the same line lets them
 * scan a column of these without reading any of them fully.
 */
export default function DishResultCard({
  dish,
  onAdd,
}: {
  dish: DishResult;
  onAdd: (dish: DishResult) => void;
}) {
  const t = useT();
  const distance = formatKm(dish.distance_km);

  return (
    <article className="flex gap-3 rounded-2xl border bg-card p-3 shadow-card transition-shadow hover:shadow-elegant">
      <Link
        to="/r/$slug"
        params={{ slug: dish.slug }}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted"
        aria-label={`${dish.item_name} at ${dish.restaurant_name}`}
      >
        {dish.photo_url ? (
          <img src={dish.photo_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <UtensilsCrossed className="h-7 w-7" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[15px] font-bold leading-tight">
              {dish.item_name}
            </h3>
            <Link
              to="/r/$slug"
              params={{ slug: dish.slug }}
              className="truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {dish.restaurant_name}
            </Link>
          </div>
          <p className="shrink-0 font-display text-[15px] font-bold text-primary">
            {formatTsh(Number(dish.price))}
          </p>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {distance && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {distance}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {t("common.minutes", { count: dish.prep_minutes })}
          </span>
          {dish.rating_count > 0 && (
            <StarRating value={Number(dish.rating)} count={dish.rating_count} />
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              dish.is_open ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {dish.is_open ? t("common.open") : t("common.closed")}
          </span>

          <Button
            size="sm"
            className="h-8 shrink-0 px-3"
            onClick={() => onAdd(dish)}
            // A paused kitchen can't take the order at all; a closed one still
            // can, because the whole point is ordering ahead.
            disabled={!dish.is_accepting_orders}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("restaurant.add")}
          </Button>
        </div>
      </div>
    </article>
  );
}
