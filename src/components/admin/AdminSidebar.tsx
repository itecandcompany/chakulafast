import { Link, useRouterState } from "@tanstack/react-router";
import {
  CreditCard,
  Home,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  Store,
  Users,
} from "lucide-react";
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

const ITEMS = [
  { label: "Overview", url: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Restaurants", url: "/admin/restaurants", icon: Store },
  { label: "Payments", url: "/admin/payments", icon: CreditCard },
  { label: "Orders", url: "/admin/orders", icon: Receipt },
  { label: "Users", url: "/admin/users", icon: Users },
  { label: "Activity", url: "/admin/activity", icon: ScrollText },
  { label: "Settings", url: "/admin/settings", icon: Settings },
] as const;

export default function AdminSidebar() {
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
            <p className="truncate font-display text-sm font-bold leading-tight">ChakulaFast</p>
            <p className="truncate text-[11px] text-muted-foreground">Platform admin</p>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Console</SidebarGroupLabel>
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
