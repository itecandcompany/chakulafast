import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AppTabBar from "@/components/AppTabBar";
import CustomerOrderCard, { type CustomerOrder } from "@/components/customer/CustomerOrderCard";
import ReviewDialog from "@/components/customer/ReviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";
import { useT } from "@/lib/i18n";
import { isLive, type OrderStatus } from "@/lib/orderStatus";
import { playAlertChime, showNotification } from "@/lib/notifications";
import { fetchCustomerOrders, patchCachedOrder } from "@/lib/queries/orders";
import { qk } from "@/lib/queryClient";

export const Route = createFileRoute("/orders")({
  ssr: false,
  component: OrdersPage,
});

function OrdersPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const [reviewing, setReviewing] = useState<CustomerOrder | null>(null);
  // Memoised: qk.* returns a new array per call, and this is an effect
  // dependency for the realtime subscription.
  const key = useMemo(() => qk.customerOrders(user?.id ?? "anonymous"), [user?.id]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth", search: { role: "customer", mode: "signin", redirect: "/orders" } });
    }
  }, [user, authLoading, navigate]);

  const {
    data: orders,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: key,
    queryFn: () => fetchCustomerOrders(user!.id),
    enabled: Boolean(user),
  });

  const error = queryError ? toUserMessage(queryError, "Couldn't load your orders.") : null;

  // Remembers which orders were already 'ready' so the alert fires on the
  // transition rather than on every render.
  const readySeen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!orders) return;
    for (const order of orders) {
      if (order.status !== "ready" || readySeen.current.has(order.id)) continue;
      readySeen.current.add(order.id);
      playAlertChime();
      showNotification(
        t("order.readyNow"),
        `${order.restaurants?.name ?? ""} · ${t("order.code", { code: order.code })}`,
        order.id,
      );
    }
  }, [orders, t]);

  useEffect(() => {
    if (!user) return;

    // Realtime is filtered server-side by customer_id, and RLS independently
    // guarantees a customer can only ever receive their own rows.
    //
    // An UPDATE moves one column — usually `status` — so it patches the cached
    // row rather than refetching fifty orders and three joins to learn that a
    // ticket went from "preparing" to "ready".
    const channel = supabase
      .channel(`customer-orders-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string };
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
          filter: `customer_id=eq.${user.id}`,
        },
        // A newly placed order needs its items and restaurant, which the
        // payload doesn't carry.
        () => void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, key, queryClient]);

  if (authLoading || !user) {
    return (
      <div className="grid min-h-[var(--app-100vh)] place-items-center text-muted-foreground lg:pl-60">
        {t("common.loading")}
      </div>
    );
  }

  const liveOrders = orders?.filter((o) => isLive(o.status as OrderStatus)) ?? [];
  const pastOrders = orders?.filter((o) => !isLive(o.status as OrderStatus)) ?? [];

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
      <header className="safe-top border-b bg-background px-4 pb-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-xl font-bold">{t("order.title")}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-4 sm:px-6 lg:px-10">
        {error && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {orders === undefined && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {orders?.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-dashed px-4 py-16 text-center">
            <Receipt className="h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-medium">{t("order.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("order.emptyHint")}</p>
            <Button asChild className="mt-4">
              <Link to="/search" search={{}}>
                {t("nav.search")}
              </Link>
            </Button>
          </div>
        )}

        {liveOrders.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("order.live")}
            </h2>
            {liveOrders.map((order) => (
              <CustomerOrderCard
                key={order.id}
                order={order}
                onChanged={() => void refetch()}
                onReview={setReviewing}
              />
            ))}
          </section>
        )}

        {pastOrders.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("order.past")}
            </h2>
            {pastOrders.map((order) => (
              <CustomerOrderCard
                key={order.id}
                order={order}
                onChanged={() => void refetch()}
                onReview={setReviewing}
              />
            ))}
          </section>
        )}
      </main>

      {reviewing?.restaurants && (
        <ReviewDialog
          open
          onOpenChange={(open) => !open && setReviewing(null)}
          orderId={reviewing.id}
          restaurantId={reviewing.restaurants.id}
          customerId={user.id}
          onSubmitted={() => void refetch()}
        />
      )}

      <AppTabBar />
    </div>
  );
}
