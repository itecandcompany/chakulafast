import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, MapPin, RefreshCw, Search, Trash2, UtensilsCrossed } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { fetchAdminRestaurants } from "@/lib/queries/adminTables";
import { qk } from "@/lib/queryClient";
import { useDebounced } from "@/hooks/useDebounced";
import Paginator from "@/components/admin/Paginator";
import { adminDeleteRestaurant, adminSetRestaurantStatus } from "@/lib/adminRestaurants.functions";
import {
  RESTAURANT_STATUS_COLORS,
  RESTAURANT_STATUS_LABEL,
  type RestaurantStatus,
} from "@/lib/restaurantStatus";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/admin/restaurants")({ component: AdminRestaurants });

type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

const STATUS_FILTERS = ["all", "pending_payment", "active", "suspended", "rejected"] as const;

function AdminRestaurants() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Restaurant | null>(null);

  const debouncedQuery = useDebounced(query);
  const filters = { query: debouncedQuery, status: statusFilter, page };

  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, statusFilter]);

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: qk.adminRestaurants(filters),
    queryFn: () => fetchAdminRestaurants(filters),
    placeholderData: (prev) => prev,
  });

  const restaurants = data?.rows ?? [];
  const total = data?.total ?? 0;

  const load = () => queryClient.invalidateQueries({ queryKey: ["admin", "restaurants"] });

  const setStatus = async (restaurant: Restaurant, status: RestaurantStatus) => {
    const reason =
      status === "suspended" || status === "rejected"
        ? window.prompt(
            `Reason for ${status === "suspended" ? "suspending" : "rejecting"} "${restaurant.name}"? The owner sees this.`,
          )
        : null;
    // A null return means the admin dismissed the prompt — treat that as
    // "changed my mind", not as "no reason given".
    if ((status === "suspended" || status === "rejected") && reason === null) return;

    setBusyId(restaurant.id);
    try {
      await adminSetRestaurantStatus({
        data: { restaurantId: restaurant.id, status, reason },
      });
      toast.success(`${restaurant.name} → ${RESTAURANT_STATUS_LABEL[status]}`);
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't update that listing."));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await adminDeleteRestaurant({ data: { restaurantId: deleting.id } });
      toast.success(`${deleting.name} deleted`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't delete that listing."));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Restaurants</h1>
          <p className="text-sm text-muted-foreground">
            {isPending ? "Loading…" : `${total} registered`}
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
            placeholder="Search by name, town or address"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as (typeof STATUS_FILTERS)[number])}
        >
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {status === "all" ? "All statuses" : RESTAURANT_STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {toUserMessage(error, "Couldn't load restaurants.")}
        </p>
      )}

      {isPending && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isPending && restaurants.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No restaurants match those filters.
        </p>
      )}

      <div className="space-y-2">
        {restaurants.map((restaurant) => (
          <div
            key={restaurant.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-card"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-muted-foreground">
                  <UtensilsCrossed className="h-5 w-5" />
                </span>
              )}
            </div>

            <div className="min-w-40 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold">{restaurant.name}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${RESTAURANT_STATUS_COLORS[restaurant.status]}`}
                >
                  {RESTAURANT_STATUS_LABEL[restaurant.status]}
                </span>
              </div>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {restaurant.town} · {restaurant.address}
              </p>
              <p className="text-xs text-muted-foreground">
                Registered {new Date(restaurant.created_at).toLocaleDateString()}
                {restaurant.rating_count > 0 &&
                  ` · ${Number(restaurant.rating).toFixed(1)}★ (${restaurant.rating_count})`}
              </p>
              {restaurant.suspended_reason && (
                <p className="mt-0.5 text-xs text-destructive">{restaurant.suspended_reason}</p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {restaurant.status === "active" && (
                <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                  <Link
                    to="/r/$slug"
                    params={{ slug: restaurant.slug }}
                    aria-label={`View ${restaurant.name}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              )}

              <Select
                value={restaurant.status}
                onValueChange={(v) => setStatus(restaurant, v as RestaurantStatus)}
                disabled={busyId === restaurant.id}
              >
                <SelectTrigger className="h-9 w-44" aria-label={`Status of ${restaurant.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_payment">
                    {RESTAURANT_STATUS_LABEL.pending_payment}
                  </SelectItem>
                  <SelectItem value="active">{RESTAURANT_STATUS_LABEL.active}</SelectItem>
                  <SelectItem value="suspended">{RESTAURANT_STATUS_LABEL.suspended}</SelectItem>
                  <SelectItem value="rejected">{RESTAURANT_STATUS_LABEL.rejected}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                aria-label={`Delete ${restaurant.name}`}
                onClick={() => setDeleting(restaurant)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {!isPending && (
        <Paginator
          page={page}
          total={total}
          rows={restaurants.length}
          onPage={setPage}
          busy={isFetching}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the listing, its menu and its opening hours. It only works
              for a restaurant that has never taken an order — anything with history has to be
              suspended instead, which hides it from customers just as effectively.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
