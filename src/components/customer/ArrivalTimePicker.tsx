import { useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { estimateTravelMinutes, formatKm, getCurrentPosition } from "@/lib/geo";
import { formatClock } from "@/lib/hours";

export type ArrivalChoice = {
  mode: "manual" | "gps";
  minutes: number;
  /** Only set when the estimate came from GPS; stored with the order. */
  position: { lat: number; lng: number } | null;
};

const QUICK_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60];

/**
 * The whole point of the app, as one control.
 *
 * A customer either knows when they'll arrive ("15 minutes") or wants the app
 * to work it out from where they're standing. Both produce the same thing —
 * a number of minutes — which the kitchen turns into a "start cooking at"
 * time. The line at the bottom closes the loop by telling the customer what
 * they'll actually get: a clock time their food will be waiting at.
 */
export default function ArrivalTimePicker({
  value,
  onChange,
  destination,
  prepMinutes,
}: {
  value: ArrivalChoice;
  onChange: (next: ArrivalChoice) => void;
  destination: { lat: number; lng: number };
  prepMinutes: number;
}) {
  const t = useT();
  const [locating, setLocating] = useState(false);
  const [estimate, setEstimate] = useState<{ minutes: number; km: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const useMyLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const position = await getCurrentPosition();
      if (!position) {
        setError(t("arrival.gpsFailed"));
        return;
      }
      const { minutes, km } = await estimateTravelMinutes(position, destination);
      setEstimate({ minutes, km });
      onChange({ mode: "gps", minutes, position });
    } catch {
      setError(t("arrival.gpsFailed"));
    } finally {
      setLocating(false);
    }
  };

  // The food is ready at arrival time, not arrival + cooking — that's the
  // promise. Showing the clock time makes it concrete instead of abstract.
  const readyAt = new Date(Date.now() + value.minutes * 60_000);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-card">
      <h2 className="font-display text-base font-bold">{t("arrival.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("arrival.subtitle")}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_MINUTES.map((minutes) => {
          const active = value.mode === "manual" && value.minutes === minutes;
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setEstimate(null);
                setError(null);
                onChange({ mode: "manual", minutes, position: null });
              }}
              className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {minutes === 0 ? t("arrival.now") : t("arrival.inMinutes", { count: minutes })}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant={value.mode === "gps" ? "default" : "outline"}
        className="mt-3 h-10 w-full"
        onClick={useMyLocation}
        disabled={locating}
      >
        {locating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LocateFixed className="h-4 w-4" />
        )}
        {locating ? t("arrival.gpsBusy") : t("arrival.useGps")}
      </Button>

      {estimate && value.mode === "gps" && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("arrival.gpsResult", {
            count: estimate.minutes,
            distance: formatKm(estimate.km) ?? "",
          })}
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        {t("arrival.readyAt", { time: formatClock(readyAt) })}
        {prepMinutes > 0 && (
          <span className="ml-1 font-normal text-primary/80">
            · {t("common.minutes", { count: prepMinutes })} to cook
          </span>
        )}
      </p>
    </section>
  );
}
