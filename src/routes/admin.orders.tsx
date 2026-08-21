import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { formatClock } from "@/lib/hours";
import {
  ORDER_STATUSES,
  STATUS_COLORS,
  STATUS_LABEL_EN,
  type OrderStatus,
} from "@/lib/orderStatus";

export const Route = createFileRoute("/admin/orders")({ component: AdminOrders });

type AdminOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  total: number;
  prep_minutes: number;
  expected_arrival_at: string;
  created_at: string;
  cancel_reason: string | null;
  restaurants: { name: string; town: string } | null;
  order_items: { id: string; name: string; qty: number }[];
};

function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `id, code, status, total, prep_minutes, expected_arrival_at, created_at, cancel_reason,
         restaurants ( name, town ),
         order_items ( id, name, qty )`,
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast.error(toUserMessage(error, "Couldn't load orders."));
      setOrders([]);
      return;
    }
    setOrders((data ?? []) as unknown as AdminOrder[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (orders ?? []).filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        order.code.toLowerCase().includes(needle) ||
        (order.restaurants?.name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [orders, query, statusFilter]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Most recent 200 orders across every restaurant.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order code or restaurant"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | OrderStatus)}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ORDER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL_EN[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {orders !== null && filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No orders match those filters.
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((order) => (
          <div
            key={order.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-card"
          >
            <div className="w-24 shrink-0">
              <p className="font-display font-bold">{order.code}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>

            <div className="min-w-40 flex-1">
              <p className="truncate font-semibold">{order.restaurants?.name ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {order.order_items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
              </p>
              {order.cancel_reason && (
                <p className="text-xs text-destructive">{order.cancel_reason}</p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="font-display font-bold">{formatTsh(Number(order.total))}</p>
              <p className="text-xs text-muted-foreground">
                arrives {formatClock(order.expected_arrival_at)}
              </p>
            </div>

            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[order.status]}`}
            >
              {STATUS_LABEL_EN[order.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
