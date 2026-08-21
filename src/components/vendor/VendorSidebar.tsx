import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, CreditCard, Home, Store, UtensilsCrossed } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { RestaurantStatus } from "@/lib/restaurantStatus";

const ITEMS = [
  { label: "Orders", url: "/vendor", icon: ClipboardList, exact: true },
  { label: "Menu", url: "/vendor/menu", icon: UtensilsCrossed },
  { label: "Restaurant", url: "/vendor/profile", icon: Store },
  { label: "Billing", url: "/vendor/billing", icon: CreditCard },
] as const;

export default function VendorSidebar({
  restaurantName,
  status,
}: {
  restaurantName: string;
  status: RestaurantStatus;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  return (
    <Sidebar>
      <SidebarContent>
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-sm font-bold text-primary-foreground">
            C
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold leading-tight">
              {restaurantName}
            </p>
            <p
              className={`truncate text-[11px] ${
                status === "active" ? "text-success" : "text-warning"
              }`}
            >
              {status === "active"
                ? "Live"
                : status === "pending_payment"
                  ? "Awaiting payment"
                  : status === "suspended"
                    ? "Suspended"
                    : "Rejected"}
            </p>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, "exact" in item && item.exact)}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/">
                    <Home className="h-4 w-4" />
                    <span>Customer site</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
