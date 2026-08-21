import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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

export const Route = createFileRoute("/orders")({
  ssr: false,
  component: OrdersPage,
});

const SELECT = `
  id, code, status, total, prep_minutes, expected_arrival_at, created_at,
  cancel_reason, note,
  restaurants ( id, name, slug, lat, lng, address ),
  order_items ( id, name, qty, line_total ),
  reviews ( id )
`;

function OrdersPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<CustomerOrder | null>(null);

  // Remembers which orders were already 'ready' so the alert fires on the
  // transition rather than on every refetch.
  const readySeen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth", search: { role: "customer", mode: "signin", redirect: "/orders" } });
    }
  }, [user, authLoading, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error: queryError } = await supabase
        .from("orders")
        .select(SELECT)
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (queryError) throw queryError;

      const rows = (data ?? []) as unknown as CustomerOrder[];

      for (const order of rows) {
        if (order.status === "ready" && !readySeen.current.has(order.id)) {
          readySeen.current.add(order.id);
          playAlertChime();
          showNotification(
            t("order.readyNow"),
            `${order.restaurants?.name ?? ""} · ${t("order.code", { code: order.code })}`,
            order.id,
          );
        }
      }

      setOrders(rows);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, "Couldn't load your orders."));
      setOrders([]);
    }
  }, [user, t]);

  useEffect(() => {
    if (!user) return;
    load();

    // Realtime is filtered server-side by customer_id, and RLS independently
    // guarantees a customer can only ever receive their own rows.
    const channel = supabase
      .channel(`customer-orders-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

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
      <header className="border-b bg-background px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-xl font-bold">{t("order.title")}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-4 sm:px-6 lg:px-10">
        {error && (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {orders === null && (
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
                onChanged={load}
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
                onChanged={load}
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
          onSubmitted={load}
        />
      )}

      <AppTabBar />
    </div>
  );
}
