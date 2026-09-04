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
  // True while a look-up triggered by navigation is still in flight.
  const [verifying, setVerifying] = useState(false);

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

  // Re-checked on every navigation inside the dashboard, not only on mount.
  //
  // This is what makes "create a listing" reach the payment page. /vendor/setup
  // sits outside VendorProvider — there is no restaurant to provide yet — so it
  // cannot refresh this state itself. It inserts the row and navigates to
  // /vendor/billing while `restaurant` here is still null and `checked` is
  // still true from the look-up that found nothing, and the redirect below
  // reads that stale pair as "this owner has no listing" and sends them back
  // to the form they just submitted.
  //
  // `verifying` is separate from `checked` on purpose. It holds the redirect
  // back until the new answer lands, without blanking the dashboard: reusing
  // `checked` would drop every vendor page to "Loading dashboard…" on every
  // click, which on a slow connection is a worse screen than the bug it fixes.
  // The cost is one indexed query per navigation, which also keeps the status
  // banner honest when an admin confirms payment mid-session.
  useEffect(() => {
    if (loading || profile?.role !== "restaurant") return;
    setVerifying(true);
    void refresh().finally(() => setVerifying(false));
  }, [loading, profile?.role, pathname, refresh]);

  // An owner with no listing has nothing to manage — send them to create one.
  // `/vendor/setup` is the one page that must stay reachable in that state.
  useEffect(() => {
    if (!checked || verifying || restaurant || pathname === "/vendor/setup") return;
    navigate({ to: "/vendor/setup" });
  }, [checked, verifying, restaurant, pathname, navigate]);

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
            <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-3">
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
