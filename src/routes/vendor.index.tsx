import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, ClipboardList, Power, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PrepQueue from "@/components/vendor/PrepQueue";
import OrderTicket, { type VendorOrder } from "@/components/vendor/OrderTicket";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { isLive, ticketUrgency, type OrderStatus } from "@/lib/orderStatus";
import {
  playAlertChime,
  requestNotificationPermission,
  showNotification,
} from "@/lib/notifications";
import { useVendor } from "@/lib/vendorContext";
import { fetchVendorOrders, patchCachedOrder } from "@/lib/queries/orders";
import { qk } from "@/lib/queryClient";
import { useNow } from "@/hooks/useNow";

export const Route = createFileRoute("/vendor/")({ component: VendorOrders });

function VendorOrders() {
  const { restaurant, refresh } = useVendor();
  const now = useNow(15_000);
  const queryClient = useQueryClient();
  // Memoised because it is an effect dependency. qk.* builds a fresh array
  // each call, so without this the realtime channel below is torn down and
  // re-subscribed on every single render.
  const key = useMemo(() => qk.vendorOrders(restaurant.id), [restaurant.id]);

  const [alertsOn, setAlertsOn] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);

  const {
    data: orders,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: key,
    queryFn: () => fetchVendorOrders(restaurant.id),
  });

  const error = queryError ? toUserMessage(queryError, "Couldn't load your orders.") : null;

  // Which orders we've already alerted on, so a re-render doesn't re-ring the
  // bell for a ticket the kitchen has already seen.
  const announced = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  // The chime is driven off the data rather than off the fetch, so it fires
  // once per genuinely new ticket regardless of whether that ticket arrived
  // via a refetch or a realtime patch.
  useEffect(() => {
    if (!orders) return;

    // Opening the dashboard must not fire the chime once per order already in
    // the queue — that is exactly the noise a busy kitchen learns to ignore.
    if (firstLoad.current) {
      for (const order of orders) announced.current.add(order.id);
      firstLoad.current = false;
      return;
    }

    for (const order of orders) {
      if (order.status !== "pending" || announced.current.has(order.id)) continue;
      announced.current.add(order.id);
      playAlertChime();
      showNotification(
        `New pre-order ${order.code}`,
        `${order.order_items.length} item(s) · arrives ${new Date(
          order.expected_arrival_at,
        ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        order.id,
      );
    }
  }, [orders]);

  useEffect(() => {
    // Two tables to watch: `orders` for status and new tickets, `order_pings`
    // for a customer's live arrival updates. RLS scopes both to this
    // restaurant's own rows, so nothing here can leak another kitchen's data.
    //
    // Neither handler refetches. A status change and a GPS ping each move one
    // field on one row, and a kitchen with several customers en route sees a
    // ping every few seconds — reloading a hundred orders and their joins each
    // time was the single largest source of requests in the app.
    const channel = supabase
      .channel(`vendor-orders-${restaurant.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string };
          // A row we don't hold means the list shape changed under us; only
          // then is a refetch the right answer.
          if (!patchCachedOrder(queryClient, key, row)) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        // A new ticket needs its order_items, which the payload doesn't carry.
        () => void queryClient.invalidateQueries({ queryKey: key }),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_pings" },
        (payload) => {
          const ping = payload.new as {
            order_id: string;
            eta_minutes: number | null;
            distance_km: number | null;
          };
          // Pings only ever move the arrival estimate on one ticket. Patch it
          // and leave the rest of the board untouched.
          patchCachedOrder(queryClient, key, {
            id: ping.order_id,
            latestPing: { eta_minutes: ping.eta_minutes, distance_km: ping.distance_km },
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurant.id, key, queryClient]);

  const enableAlerts = async () => {
    const result = await requestNotificationPermission();
    if (result === "granted") {
      setAlertsOn(true);
      // Also unlocks the AudioContext: browsers only allow sound after a
      // user gesture, and this button is that gesture.
      playAlertChime(0.15);
      toast.success("Alerts on — you'll hear new orders arrive.");
    } else if (result === "unsupported") {
      toast.error("This browser doesn't support notifications.");
    } else {
      toast.error("Notifications are blocked. Enable them in your browser settings.");
    }
  };

  const toggleAcceptingOrders = async () => {
    setTogglingOpen(true);
    try {
      const { error: updateError } = await supabase
        .from("restaurants")
        .update({ is_accepting_orders: !restaurant.is_accepting_orders })
        .eq("id", restaurant.id);
      if (updateError) throw updateError;
      await refresh();
      toast.success(
        restaurant.is_accepting_orders ? "Pre-orders paused" : "Now accepting pre-orders",
      );
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't change that."));
    } finally {
      setTogglingOpen(false);
    }
  };

  const live = orders?.filter((o) => isLive(o.status as OrderStatus)) ?? [];
  const done = orders?.filter((o) => !isLive(o.status as OrderStatus)) ?? [];

  // "Needs attention" is the only sort a kitchen cares about: whatever should
  // be on the heat first, first.
  const cooking = live.filter((o) => {
    const urgency = ticketUrgency(o.status, o.expected_arrival_at, o.prep_minutes, now);
    return urgency === "late" || urgency === "cook_now";
  });

  const takings = done
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + Number(o.total), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ---------- Status strip ---------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-card">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold">
            {live.length} live {live.length === 1 ? "order" : "orders"}
          </p>
          <p className="text-xs text-muted-foreground">
            {cooking.length > 0
              ? `${cooking.length} need${cooking.length === 1 ? "s" : ""} cooking now`
              : "Nothing to start yet"}
            {" · "}
            {formatTsh(takings)} collected
          </p>
        </div>

        <Button
          variant={alertsOn ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={enableAlerts}
        >
          {alertsOn ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          {alertsOn ? "Alerts on" : "Enable alerts"}
        </Button>

        <Button
          variant={restaurant.is_accepting_orders ? "outline" : "default"}
          size="sm"
          className="h-9"
          onClick={toggleAcceptingOrders}
          disabled={togglingOpen}
        >
          <Power className="h-3.5 w-3.5" />
          {restaurant.is_accepting_orders ? "Pause orders" : "Resume orders"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => void refetch()}
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <Tabs defaultValue="live">
        <TabsList className="w-full">
          <TabsTrigger value="live" className="flex-1">
            Live ({live.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History ({done.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-3 pt-4">
          {cooking.length > 0 && <PrepQueue orders={cooking} />}

          {orders === undefined &&
            [0, 1].map((i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}

          {orders !== undefined && live.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed px-4 py-16 text-center">
              <ClipboardList className="h-9 w-9 text-muted-foreground" />
              <p className="mt-3 font-medium">No live orders</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                New pre-orders appear here the moment a customer places one. Keep this page open and
                turn on alerts so you hear them.
              </p>
            </div>
          )}

          {live.map((order) => (
            <OrderTicket key={order.id} order={order} onChanged={() => void refetch()} />
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 pt-4">
          {done.length === 0 && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Completed and cancelled orders show up here.
            </p>
          )}
          {done.map((order) => (
            <OrderTicket key={order.id} order={order} onChanged={() => void refetch()} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
