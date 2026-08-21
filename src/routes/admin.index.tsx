import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChefHat,
  CreditCard,
  Receipt,
  RefreshCw,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { LIVE_STATUSES } from "@/lib/orderStatus";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

type Kpis = {
  totalUsers: number;
  totalRestaurants: number;
  activeRestaurants: number;
  awaitingPayment: number;
  paymentsToVerify: number;
  totalOrders: number;
  liveOrders: number;
  completedOrders: number;
  feeRevenue: number;
  orderVolume: number;
};

function AdminOverview() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [
        users,
        restaurants,
        active,
        awaiting,
        toVerify,
        ordersAll,
        ordersLive,
        ordersDone,
        confirmedPayments,
        completedTotals,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase
          .from("restaurants")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("restaurants")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_payment"),
        supabase
          .from("registration_payments")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("status", [...LIVE_STATUSES]),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed"),
        supabase.from("registration_payments").select("amount").eq("status", "confirmed"),
        supabase.from("orders").select("total").eq("status", "completed"),
      ]);

      setKpis({
        totalUsers: users.count ?? 0,
        totalRestaurants: restaurants.count ?? 0,
        activeRestaurants: active.count ?? 0,
        awaitingPayment: awaiting.count ?? 0,
        paymentsToVerify: toVerify.count ?? 0,
        totalOrders: ordersAll.count ?? 0,
        liveOrders: ordersLive.count ?? 0,
        completedOrders: ordersDone.count ?? 0,
        // The platform's actual income: registration fees, not order value.
        feeRevenue: (confirmedPayments.data ?? []).reduce(
          (sum, row) => sum + Number(row.amount ?? 0),
          0,
        ),
        // Food sold through the platform. Money the restaurants take, not us.
        orderVolume: (completedTotals.data ?? []).reduce(
          (sum, row) => sum + Number(row.total ?? 0),
          0,
        ),
      });
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, "Failed to load dashboard data"));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const cards = [
    { label: "Registered users", value: kpis?.totalUsers, icon: Users },
    { label: "Restaurants", value: kpis?.totalRestaurants, icon: Store },
    { label: "Live listings", value: kpis?.activeRestaurants, icon: ChefHat },
    { label: "Awaiting payment", value: kpis?.awaitingPayment, icon: CreditCard },
    { label: "Total orders", value: kpis?.totalOrders, icon: Receipt },
    { label: "Orders in progress", value: kpis?.liveOrders, icon: Receipt },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Refreshes automatically every 30 seconds.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {/* The one thing an admin has to act on, surfaced above everything else
          — an unverified payment is a restaurant sitting invisible, waiting. */}
      {kpis && kpis.paymentsToVerify > 0 && (
        <Link
          to="/admin/payments"
          className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 transition-colors hover:bg-warning/20"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {kpis.paymentsToVerify} payment{kpis.paymentsToVerify === 1 ? "" : "s"} waiting to be
              verified
            </p>
            <p className="text-sm text-muted-foreground">
              Each one is a restaurant that has paid and can't be found by customers yet.
            </p>
          </div>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <card.icon className="h-4 w-4" />
              <span className="text-xs font-medium">{card.label}</span>
            </div>
            {card.value === undefined ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-display text-2xl font-extrabold">{card.value}</p>
            )}
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-medium">Platform revenue (registration fees)</span>
          </div>
          {kpis === null ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <p className="mt-1 font-display text-2xl font-extrabold text-primary">
              {formatTsh(kpis.feeRevenue)}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Receipt className="h-4 w-4" />
            <span className="text-xs font-medium">Food sold through the platform</span>
          </div>
          {kpis === null ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <>
              <p className="mt-1 font-display text-2xl font-extrabold">
                {formatTsh(kpis.orderVolume)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Paid directly to restaurants across {kpis.completedOrders} collected orders — the
                platform takes no commission.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
