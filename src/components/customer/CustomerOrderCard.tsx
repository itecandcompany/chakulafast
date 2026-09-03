import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Clock, MapPin, Navigation, RotateCcw, Star, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import OrderStatusTracker from "@/components/customer/OrderStatusTracker";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { formatClock } from "@/lib/hours";
import { useT } from "@/lib/i18n";
import {
  customerCanCancel,
  isLive,
  minutesUntilArrival,
  STATUS_COLORS,
  STATUS_LABEL_KEY,
  type OrderStatus,
} from "@/lib/orderStatus";
import { useCart } from "@/lib/cart";
import { useArrivalSharing } from "@/hooks/useArrivalSharing";
import { useNow } from "@/hooks/useNow";

export type CustomerOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  total: number;
  prep_minutes: number;
  expected_arrival_at: string;
  created_at: string;
  cancel_reason: string | null;
  note: string | null;
  restaurants: {
    id: string;
    name: string;
    slug: string;
    lat: number;
    lng: number;
    address: string;
    town: string;
  } | null;
  order_items: {
    id: string;
    name: string;
    qty: number;
    line_total: number;
    menu_item_id: string | null;
  }[];
  reviews: { id: string }[];
};

export default function CustomerOrderCard({
  order,
  onChanged,
  onReview,
}: {
  order: CustomerOrder;
  onChanged: () => void;
  onReview: (order: CustomerOrder) => void;
}) {
  const t = useT();
  const now = useNow(15_000);
  const [sharing, setSharing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const navigate = useNavigate();
  const clearCart = useCart((s) => s.clear);
  const addToCart = useCart((s) => s.add);

  const destination = order.restaurants
    ? { lat: order.restaurants.lat, lng: order.restaurants.lng }
    : { lat: 0, lng: 0 };

  const { etaMinutes, error: sharingError } = useArrivalSharing(
    order.id,
    destination,
    sharing && Boolean(order.restaurants),
  );

  const live = isLive(order.status);
  const minutesLeft = minutesUntilArrival(order.expected_arrival_at, now);

  /**
   * Rebuild this order in the basket.
   *
   * Prices and availability are re-read from the live menu rather than reused
   * from the order's snapshots: a dish may have gone up, gone out of stock or
   * been taken off the menu since. Reusing the old price would only be
   * overwritten by prepare_order_item() at checkout anyway, so the customer
   * would see the number change under them at the worst possible moment.
   */
  const reorder = async () => {
    if (!order.restaurants) return;
    setReordering(true);
    try {
      const ids = order.order_items
        .map((i) => i.menu_item_id)
        .filter((id): id is string => id !== null);

      if (ids.length === 0) {
        toast.error(t("order.reorderGone"));
        return;
      }

      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price, prep_minutes, photo_url, is_available")
        .in("id", ids);
      if (error) throw error;

      // Named `available`, not `live` — the outer `live` means "order is in
      // progress" and shadowing it here would be a trap for the next reader.
      const available = (data ?? []).filter((m) => m.is_available);
      if (available.length === 0) {
        toast.error(t("order.reorderGone"));
        return;
      }

      clearCart();
      for (const item of available) {
        const qty = order.order_items.find((i) => i.menu_item_id === item.id)?.qty ?? 1;
        addToCart(
          {
            id: order.restaurants.id,
            name: order.restaurants.name,
            slug: order.restaurants.slug,
            lat: order.restaurants.lat,
            lng: order.restaurants.lng,
            address: order.restaurants.address,
            town: order.restaurants.town,
          },
          {
            menuItemId: item.id,
            name: item.name,
            unitPrice: Number(item.price),
            prepMinutes: item.prep_minutes,
            photoUrl: item.photo_url,
          },
          qty,
        );
      }

      const missing = ids.length - available.length;
      if (missing > 0) toast.warning(t("order.reorderPartial", { count: missing }));
      navigate({ to: "/cart" });
    } catch (err) {
      toast.error(toUserMessage(err, t("common.somethingWrong")));
    } finally {
      setReordering(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled", cancel_reason: "Cancelled by customer" })
        .eq("id", order.id);
      if (error) throw error;
      toast.success(t("order.cancelled"));
      setConfirmOpen(false);
      onChanged();
    } catch (err) {
      toast.error(toUserMessage(err, t("common.somethingWrong")));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {order.restaurants ? (
            <Link
              to="/r/$slug"
              params={{ slug: order.restaurants.slug }}
              className="truncate font-display text-base font-bold hover:underline"
            >
              {order.restaurants.name}
            </Link>
          ) : (
            <span className="font-display text-base font-bold text-muted-foreground">
              Restaurant unavailable
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            {t("order.code", { code: order.code })} ·{" "}
            {t("order.placed", { time: formatClock(order.created_at) })}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[order.status]}`}
        >
          {t(STATUS_LABEL_KEY[order.status])}
        </span>
      </header>

      {live && <OrderStatusTracker status={order.status} />}
      {order.status === "cancelled" && (
        <OrderStatusTracker status={order.status} cancelReason={order.cancel_reason} />
      )}

      {/* ---------- The promise, restated ---------- */}
      {live && (
        <div className="rounded-xl bg-muted/60 p-3">
          {order.status === "ready" ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <Clock className="h-4 w-4" />
              {t("order.readyNow")}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {minutesLeft > 0 ? t("order.readyIn", { count: minutesLeft }) : t("order.readyNow")}
              <span className="font-normal text-muted-foreground">
                · {t("order.arriveBy", { time: formatClock(order.expected_arrival_at) })}
              </span>
            </p>
          )}

          {order.status === "ready" && (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("order.showCode")}</p>
          )}
        </div>
      )}

      {/* ---------- Items ---------- */}
      <ul className="space-y-1 text-sm">
        {order.order_items.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">
              <span className="font-medium tabular-nums">{item.qty}×</span> {item.name}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {formatTsh(Number(item.line_total))}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t pt-2">
        <span className="text-sm text-muted-foreground">{t("common.total")}</span>
        <span className="font-display text-lg font-bold">{formatTsh(Number(order.total))}</span>
      </div>

      {/* ---------- Actions ---------- */}
      {live && order.restaurants && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={sharing ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setSharing((s) => !s)}
            >
              <Navigation className="h-3.5 w-3.5" />
              {sharing ? t("order.stopSharing") : t("order.imOnMyWay")}
            </Button>

            <Button asChild variant="outline" size="sm" className="h-9">
              <a
                href={`https://www.openstreetmap.org/directions?to=${order.restaurants.lat}%2C${order.restaurants.lng}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <MapPin className="h-3.5 w-3.5" />
                {t("restaurant.directions")}
              </a>
            </Button>

            {customerCanCancel(order.status) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-destructive hover:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("order.cancel")}
              </Button>
            )}
          </div>

          {sharing && (
            <p className="text-xs text-muted-foreground">
              {etaMinutes != null
                ? t("order.eta", { count: etaMinutes })
                : t("order.sharingLocation")}
            </p>
          )}
          {sharingError && <p className="text-xs text-destructive">{sharingError}</p>}
        </div>
      )}

      {!live && order.restaurants && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={reorder}
            disabled={reordering}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("order.reorder")}
          </Button>

          {order.status === "completed" && order.reviews.length === 0 && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => onReview(order)}>
              <Star className="h-3.5 w-3.5" />
              {t("order.rate")}
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("order.cancelConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("order.cancelConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{t("common.back")}</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} disabled={cancelling}>
              {t("order.cancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
