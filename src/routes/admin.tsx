import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AdminSidebar from "@/components/admin/AdminSidebar";
import UnconfirmedEmailBanner from "@/components/UnconfirmedEmailBanner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminLayout,
});

/**
 * The redirect below is a convenience, not a security boundary — every table
 * the console touches is gated by has_role(auth.uid(), 'admin') in RLS, and
 * every privileged action re-checks the caller server-side. Someone who
 * forces their way to this URL sees an empty console, not the platform.
 */
function AdminLayout() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth", search: { role: "customer", mode: "signin" } });
    else if (profile && profile.role !== "admin") navigate({ to: "/" });
  }, [user, profile, loading, navigate]);

  if (loading || !profile || profile.role !== "admin") {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading admin…
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/30">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="safe-top sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b bg-background px-3 pb-2 [--safe-top-min:0.5rem]">
            <SidebarTrigger />
            <div className="font-display font-semibold">Admin console</div>
            <div className="ml-auto hidden text-xs text-muted-foreground sm:block">
              Signed in as {profile.full_name}
            </div>
          </header>
          <UnconfirmedEmailBanner />

          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
