import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import VendorSidebar from "@/components/vendor/VendorSidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { VendorProvider, type Restaurant } from "@/lib/vendorContext";

export const Route = createFileRoute("/vendor")({
  // Every page under here is scoped to one signed-in owner's own data.
  ssr: false,
  component: VendorLayout,
});

function VendorLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [checked, setChecked] = useState(false);

  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    setRestaurant(data ?? null);
    setChecked(true);
  }, [userId]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { role: "restaurant", mode: "signin" } });
      return;
    }
    if (profile && profile.role !== "restaurant") {
      navigate({ to: profile.role === "admin" ? "/admin" : "/" });
    }
  }, [user, profile, loading, navigate]);

  useEffect(() => {
    if (!loading && profile?.role === "restaurant") void refresh();
  }, [loading, profile?.role, refresh]);

  // An owner with no listing has nothing to manage — send them to create one.
  // `/vendor/setup` is the one page that must stay reachable in that state.
  useEffect(() => {
    if (!checked || restaurant || pathname === "/vendor/setup") return;
    navigate({ to: "/vendor/setup" });
  }, [checked, restaurant, pathname, navigate]);

  // Payment gates the *listing*, not the dashboard: an unpaid restaurant can
  // still set up its menu and hours so it's ready to go the moment the fee
  // clears. Only the order board is pointless before then, since customers
  // can't see the listing to order from it.
  useEffect(() => {
    if (!restaurant) return;
    if (restaurant.status === "pending_payment" && pathname === "/vendor") {
      navigate({ to: "/vendor/billing" });
    }
  }, [restaurant, pathname, navigate]);

  if (loading || !profile || profile.role !== "restaurant") {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  // The setup page runs before a restaurant exists, so it can't sit inside
  // VendorProvider (there's nothing to provide yet) or inside the sidebar
  // chrome (there's nothing to navigate between).
  if (pathname === "/vendor/setup") {
    return <Outlet />;
  }

  if (!checked || !restaurant) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <VendorProvider value={{ restaurant, refresh }}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-muted/30">
          <VendorSidebar restaurantName={restaurant.name} status={restaurant.status} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b bg-background px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <SidebarTrigger />
              <div className="font-display font-semibold">Restaurant dashboard</div>
              <div className="ml-auto hidden text-xs text-muted-foreground sm:block">
                {profile.full_name}
              </div>
            </header>

            {restaurant.status === "suspended" && (
              <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This listing is suspended and is not visible to customers.
                  {restaurant.suspended_reason ? ` ${restaurant.suspended_reason}` : ""} Contact
                  platform support to resolve it.
                </p>
              </div>
            )}

            <main className="flex-1 overflow-auto p-4 md:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </VendorProvider>
  );
}
