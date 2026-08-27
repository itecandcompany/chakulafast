import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, RefreshCw, Timer, TrendingUp, UtensilsCrossed, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { useVendor } from "@/lib/vendorContext";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/vendor/insights")({ component: VendorInsights });

type Summary = Database["public"]["Functions"]["vendor_summary"]["Returns"][number];
type Daily = Database["public"]["Functions"]["vendor_daily"]["Returns"][number];
type TopDish = Database["public"]["Functions"]["vendor_top_dishes"]["Returns"][number];
type Hour = Database["public"]["Functions"]["vendor_busiest_hours"]["Returns"][number];

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

function VendorInsights() {
  const { restaurant } = useVendor();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<Daily[] | null>(null);
  const [top, setTop] = useState<TopDish[] | null>(null);
  const [hours, setHours] = useState<Hour[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d, t, h] = await Promise.all([
        supabase.rpc("vendor_summary", { _restaurant_id: restaurant.id, _days: days }),
        supabase.rpc("vendor_daily", { _restaurant_id: restaurant.id, _days: Math.min(days, 30) }),
        supabase.rpc("vendor_top_dishes", {
          _restaurant_id: restaurant.id,
          _days: days,
          _limit: 8,
        }),
        supabase.rpc("vendor_busiest_hours", { _restaurant_id: restaurant.id, _days: days }),
      ]);
      if (s.error) throw s.error;
      setSummary((s.data ?? [])[0] ?? null);
      setDaily(d.data ?? []);
      setTop(t.data ?? []);
      setHours(h.data ?? []);
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't load your numbers."));
      setDaily([]);
      setTop([]);
      setHours([]);
    }
  }, [restaurant.id, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTakings = Math.max(1, ...(daily ?? []).map((d) => Number(d.takings)));
  const maxHour = Math.max(1, ...(hours ?? []).map((h) => Number(h.orders)));
  const busiest = (hours ?? []).reduce<Hour | null>(
    (best, h) => (best === null || Number(h.orders) > Number(best.orders) ? h : best),
    null,
  );

  const tiles = [
    {
      label: "Takings",
      value: summary ? formatTsh(Number(summary.takings)) : null,
      hint: summary ? `${summary.orders_completed} collected` : "",
      Icon: Wallet,
    },
    {
      label: "Average order",
      value: summary ? formatTsh(Number(summary.average_order)) : null,
      hint: summary ? `${summary.orders_total} placed` : "",
      Icon: TrendingUp,
    },
    {
      label: "Ready on time",
      // The number the whole product is judged on, so it is shown even when
      // it is bad — and as "—" rather than 0% when nothing has been cooked
      // yet, because those mean very different things.
      value: summary?.ready_on_time_pct == null ? "—" : `${Number(summary.ready_on_time_pct)}%`,
      hint: "of orders ready before the customer arrived",
      Icon: Clock,
    },
    {
      label: "Typical prep",
      value:
        summary?.median_prep_minutes == null ? "—" : `${Number(summary.median_prep_minutes)} min`,
      hint: "median, accepted to ready",
      Icon: Timer,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Insights</h1>
          <p className="text-sm text-muted-foreground">
            What you took, what sold, and when your kitchen is busiest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-9 w-36" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.days} value={String(r.days)}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={load}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---------- Headline tiles ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <tile.Icon className="h-4 w-4" />
              <span className="text-xs font-medium">{tile.label}</span>
            </div>
            {tile.value === null ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <p className="mt-1 font-display text-xl font-extrabold">{tile.value}</p>
            )}
            {tile.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.hint}</p>}
          </Card>
        ))}
      </div>

      {/* ---------- Daily takings ----------
          A plain CSS bar chart rather than a charting library: it is a dozen
          bars with no interaction, and recharts was 100kB of the bundle for
          exactly this. */}
      <Card className="p-4">
        <h2 className="font-display text-base font-bold">Takings per day</h2>
        {daily === null ? (
          <Skeleton className="mt-3 h-32 w-full" />
        ) : daily.every((d) => Number(d.orders) === 0) ? (
          <p className="mt-3 text-sm text-muted-foreground">No orders in this period yet.</p>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1" role="img" aria-label="Daily takings">
            {daily.map((d) => {
              const value = Number(d.takings);
              return (
                <div key={d.day} className="group relative flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(2, (value / maxTakings) * 100)}%` }}
                  />
                  <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                    {new Date(d.day).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {formatTsh(value)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ---------- Best sellers ---------- */}
      <Card className="p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-bold">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          Best sellers
        </h2>
        {top === null ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : top.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing collected yet in this period.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {top.map((dish, i) => (
              <li key={dish.name} className="flex items-baseline gap-3 text-sm">
                <span className="w-4 shrink-0 text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{dish.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">×{dish.qty}</span>
                <span className="w-24 shrink-0 text-right font-display font-bold">
                  {formatTsh(Number(dish.takings))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* ---------- Busiest hours ---------- */}
      <Card className="p-4">
        <h2 className="font-display text-base font-bold">When customers arrive</h2>
        <p className="text-sm text-muted-foreground">
          By the arrival time customers asked for, not when they ordered — this is what to staff
          against.
        </p>
        {hours === null ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : (
          <>
            <div
              className="mt-4 flex h-24 items-end gap-0.5"
              role="img"
              aria-label="Orders by hour"
            >
              {hours.map((h) => (
                <div
                  key={h.hour}
                  title={`${String(h.hour).padStart(2, "0")}:00 — ${h.orders} order(s)`}
                  className={`flex-1 rounded-t ${Number(h.orders) > 0 ? "bg-primary/70" : "bg-muted"}`}
                  style={{ height: `${Math.max(3, (Number(h.orders) / maxHour) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
            {busiest && Number(busiest.orders) > 0 && (
              <p className="mt-2 text-sm">
                Busiest around{" "}
                <span className="font-semibold">{String(busiest.hour).padStart(2, "0")}:00</span>
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
