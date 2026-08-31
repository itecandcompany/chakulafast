import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { qk } from "@/lib/queryClient";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

function AdminOverview() {
  // One request instead of ten, and the two revenue figures are summed in
  // Postgres. The previous version pulled every registration_payments.amount
  // and every orders.total into the browser to add them up — unbounded by
  // construction, and slower with every order the platform ever takes.
  const {
    data: kpis,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: qk.adminSummary(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_summary");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
    // The console is a monitoring surface, so it stays current on its own —
    // but 60s rather than the old 30s, now that it is one cheap call.
    refetchInterval: 60_000,
  });

  const error = queryError ? toUserMessage(queryError, "Failed to load dashboard data") : null;

  const cards = [
    { label: "Registered users", value: kpis?.total_users, icon: Users },
    { label: "Restaurants", value: kpis?.total_restaurants, icon: Store },
    { label: "Live listings", value: kpis?.active_restaurants, icon: ChefHat },
    { label: "Awaiting payment", value: kpis?.awaiting_payment, icon: CreditCard },
    { label: "Total orders", value: kpis?.total_orders, icon: Receipt },
    { label: "Orders in progress", value: kpis?.live_orders, icon: Receipt },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Refreshes automatically every minute.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {/* The one thing an admin has to act on, surfaced above everything else
          — an unverified payment is a restaurant sitting invisible, waiting. */}
      {kpis && kpis.payments_to_verify > 0 && (
        <Link
          to="/admin/payments"
          className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 transition-colors hover:bg-warning/20"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {kpis.payments_to_verify} payment{kpis.payments_to_verify === 1 ? "" : "s"} waiting to
              be verified
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
          {!kpis ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <p className="mt-1 font-display text-2xl font-extrabold text-primary">
              {formatTsh(Number(kpis.fee_revenue))}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Receipt className="h-4 w-4" />
            <span className="text-xs font-medium">Food sold through the platform</span>
          </div>
          {!kpis ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <>
              <p className="mt-1 font-display text-2xl font-extrabold">
                {formatTsh(Number(kpis.order_volume))}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Paid directly to restaurants across {kpis.completed_orders} collected orders — the
                platform takes no commission.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
