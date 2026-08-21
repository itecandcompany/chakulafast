import { SlidersHorizontal, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { MENU_CATEGORIES, MENU_CATEGORY_KEYS, type MenuCategory } from "@/lib/menuCategories";
import { RADIUS_OPTIONS } from "@/lib/geo";
import { TOWNS } from "@/lib/towns";
import { SORT_OPTIONS, type SearchFilters, type SortOption } from "@/lib/search";
import type { TKey } from "@/lib/i18n";

const SORT_LABEL_KEYS: Record<SortOption, TKey> = {
  distance: "filter.sortDistance",
  price_asc: "filter.sortPriceAsc",
  price_desc: "filter.sortPriceDesc",
  rating: "filter.sortRating",
  prep: "filter.sortPrep",
};

// Radix Select can't hold "" as a value (it means "nothing selected"), so the
// "no filter" option needs a real sentinel of its own.
const ANY = "__any__";

export default function FilterBar({
  filters,
  onChange,
  towns,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  /** Towns that actually have listings; falls back to the static list. */
  towns?: string[];
}) {
  const t = useT();
  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const townOptions = towns?.length ? towns : TOWNS.map((tw) => tw.name);

  const hasFilters =
    filters.category !== null ||
    filters.maxKm !== null ||
    filters.maxPrice !== null ||
    filters.openOnly ||
    filters.town !== null ||
    filters.sort !== "distance";

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
      <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("filter.sort")}
      </span>

      <Select value={filters.sort} onValueChange={(v) => set("sort", v as SortOption)}>
        <SelectTrigger
          className="h-9 w-auto shrink-0 rounded-full text-xs"
          aria-label={t("filter.sort")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(SORT_LABEL_KEYS[option])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.category ?? ANY}
        onValueChange={(v) => set("category", v === ANY ? null : (v as MenuCategory))}
      >
        <SelectTrigger
          className="h-9 w-auto shrink-0 rounded-full text-xs"
          aria-label={t("filter.category")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("filter.allCategories")}</SelectItem>
          {MENU_CATEGORY_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {t(MENU_CATEGORIES[key].labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.town ?? ANY} onValueChange={(v) => set("town", v === ANY ? null : v)}>
        <SelectTrigger
          className="h-9 w-auto shrink-0 rounded-full text-xs"
          aria-label={t("filter.area")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("filter.area")}</SelectItem>
          {townOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.maxKm != null ? String(filters.maxKm) : ANY}
        onValueChange={(v) => set("maxKm", v === ANY ? null : Number(v))}
      >
        <SelectTrigger
          className="h-9 w-auto shrink-0 rounded-full text-xs"
          aria-label={t("filter.anyDistance")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("filter.anyDistance")}</SelectItem>
          {RADIUS_OPTIONS.map((km) => (
            <SelectItem key={km} value={String(km)}>
              {t("filter.distance", { km })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={() => set("openOnly", !filters.openOnly)}
        aria-pressed={filters.openOnly}
        className={`h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors ${
          filters.openOnly
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-muted"
        }`}
      >
        {t("filter.openOnly")}
      </button>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 rounded-full text-xs"
          onClick={() =>
            onChange({
              ...filters,
              category: null,
              maxKm: null,
              maxPrice: null,
              openOnly: false,
              town: null,
              sort: "distance",
            })
          }
        >
          <X className="h-3.5 w-3.5" />
          {t("search.clearFilters")}
        </Button>
      )}
    </div>
  );
}
