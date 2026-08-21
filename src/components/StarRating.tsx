import { Star } from "lucide-react";

/**
 * Read-only star rating.
 *
 * Rendered as one accessible label plus decorative icons rather than five
 * separate images — a screen reader should hear "4.5 out of 5" once, not
 * "star star star" five times.
 */
export function StarRating({
  value,
  count,
  size = "sm",
  className = "",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const rounded = Math.round(value * 2) / 2;

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      aria-label={`${value.toFixed(1)} out of 5${count != null ? `, ${count} reviews` : ""}`}
    >
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`${dim} ${
              i <= rounded
                ? "fill-warning text-warning"
                : i - 0.5 === rounded
                  ? "fill-warning/50 text-warning"
                  : "text-muted-foreground/40"
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">
        {value > 0 ? value.toFixed(1) : "—"}
        {count != null && count > 0 ? ` (${count})` : ""}
      </span>
    </span>
  );
}

/**
 * Interactive rating input. Real radio buttons under the hood so it works
 * with a keyboard and announces itself properly, with the stars carried by
 * peer-checked styling.
 */
export function StarInput({
  value,
  onChange,
  name = "rating",
}: {
  value: number;
  onChange: (stars: number) => void;
  name?: string;
}) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">Rating out of 5</legend>
      {[1, 2, 3, 4, 5].map((i) => (
        <label key={i} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={i}
            checked={value === i}
            onChange={() => onChange(i)}
            className="peer sr-only"
          />
          <Star
            className={`h-8 w-8 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
              i <= value ? "fill-warning text-warning" : "text-muted-foreground/40"
            }`}
          />
          <span className="sr-only">
            {i} star{i > 1 ? "s" : ""}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
