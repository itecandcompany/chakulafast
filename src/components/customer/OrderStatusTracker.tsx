import { Check, ChefHat, ClipboardCheck, Send, ShoppingBag, XCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  ORDER_PIPELINE,
  STATUS_LABEL_KEY,
  pipelineIndex,
  type OrderStatus,
} from "@/lib/orderStatus";

const STEP_ICONS = {
  pending: Send,
  accepted: ClipboardCheck,
  preparing: ChefHat,
  ready: ShoppingBag,
  completed: Check,
} as const;

/**
 * The customer's view of where their food is.
 *
 * Cancelled is rendered as a replacement for the whole track rather than as
 * a sixth step: once an order is cancelled, how far it got before that is
 * noise, and a half-filled progress bar next to the word "cancelled" reads as
 * a bug rather than as information.
 */
export default function OrderStatusTracker({
  status,
  cancelReason,
}: {
  status: OrderStatus;
  cancelReason?: string | null;
}) {
  const t = useT();

  if (status === "cancelled") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">{t("status.cancelled")}</p>
          {cancelReason && <p className="mt-0.5 text-xs text-muted-foreground">{cancelReason}</p>}
        </div>
      </div>
    );
  }

  const current = pipelineIndex(status);

  return (
    <ol className="flex items-start" aria-label={t("order.title")}>
      {ORDER_PIPELINE.map((step, index) => {
        const Icon = STEP_ICONS[step];
        const done = index < current;
        const active = index === current;
        const isLast = index === ORDER_PIPELINE.length - 1;

        return (
          <li key={step} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* Spacers keep every dot centred under its own label, so the
                  connecting lines don't drift out of alignment at the ends. */}
              <div
                className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : done || active ? "bg-primary" : "bg-border"}`}
              />
              <div
                aria-current={active ? "step" : undefined}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div
                className={`h-0.5 flex-1 ${isLast ? "bg-transparent" : done ? "bg-primary" : "bg-border"}`}
              />
            </div>
            <span
              className={`mt-1.5 text-center text-[10px] leading-tight sm:text-xs ${
                active ? "font-semibold text-foreground" : "text-muted-foreground"
              }`}
            >
              {t(STATUS_LABEL_KEY[step])}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
