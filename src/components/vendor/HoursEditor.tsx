import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { DAY_NAMES, DEFAULT_HOURS, normalizeWeek, toTimeInput, type DayHours } from "@/lib/hours";

/**
 * Weekly opening hours.
 *
 * Saved as a full seven-row upsert rather than a diff — the week is small,
 * and writing all of it means a row can never go missing and silently read as
 * "closed" (which is what a missing day means to is_restaurant_open()).
 */
export default function HoursEditor({ restaurantId }: { restaurantId: string }) {
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("restaurant_hours")
        .select("day_of_week, opens_at, closes_at, is_closed")
        .eq("restaurant_id", restaurantId);

      if (cancelled) return;
      if (error) {
        toast.error(toUserMessage(error, "Couldn't load your opening hours."));
      } else if (data?.length) {
        setHours(normalizeWeek(data as DayHours[]));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const update = (day: number, patch: Partial<DayHours>) =>
    setHours((current) => current.map((h) => (h.day_of_week === day ? { ...h, ...patch } : h)));

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurant_hours").upsert(
        hours.map((h) => ({
          restaurant_id: restaurantId,
          day_of_week: h.day_of_week,
          opens_at: h.opens_at,
          closes_at: h.closes_at,
          is_closed: h.is_closed,
        })),
        { onConflict: "restaurant_id,day_of_week" },
      );
      if (error) throw error;
      toast.success("Opening hours saved");
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't save your opening hours."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading hours…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="divide-y rounded-2xl border">
        {hours.map((day) => (
          <div key={day.day_of_week} className="flex flex-wrap items-center gap-3 p-3">
            <span className="w-24 shrink-0 text-sm font-medium">{DAY_NAMES[day.day_of_week]}</span>

            <label className="flex items-center gap-2">
              <span className="sr-only">{DAY_NAMES[day.day_of_week]} open</span>
              <Switch
                checked={!day.is_closed}
                onCheckedChange={(checked) => update(day.day_of_week, { is_closed: !checked })}
              />
              <span className="text-xs text-muted-foreground">
                {day.is_closed ? "Closed" : "Open"}
              </span>
            </label>

            {!day.is_closed && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={`${DAY_NAMES[day.day_of_week]} opening time`}
                  value={toTimeInput(day.opens_at)}
                  onChange={(e) => update(day.day_of_week, { opens_at: e.target.value })}
                  className="h-9 w-[7.5rem]"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  aria-label={`${DAY_NAMES[day.day_of_week]} closing time`}
                  value={toTimeInput(day.closes_at)}
                  onChange={(e) => update(day.day_of_week, { closes_at: e.target.value })}
                  className="h-9 w-[7.5rem]"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        A closing time earlier than the opening time means you run past midnight — 18:00 to 02:00
        works as you'd expect.
      </p>

      <Button onClick={save} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Save hours
      </Button>
    </div>
  );
}
