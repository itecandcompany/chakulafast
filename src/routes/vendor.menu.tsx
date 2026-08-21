import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import MenuItemDialog, { type MenuItem } from "@/components/vendor/MenuItemDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import {
  categoryLabelEn,
  MENU_CATEGORIES,
  MENU_CATEGORY_KEYS,
  type MenuCategory,
} from "@/lib/menuCategories";
import { deletePhoto } from "@/lib/photos";
import { useVendor } from "@/lib/vendorContext";

export const Route = createFileRoute("/vendor/menu")({ component: VendorMenu });

function VendorMenu() {
  const { restaurant } = useVendor();
  const { user } = useAuth();

  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error(toUserMessage(error, "Couldn't load your menu."));
      setItems([]);
      return;
    }
    setItems(data ?? []);
  }, [restaurant.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const byCategory = new Map<MenuCategory, MenuItem[]>();
    for (const item of items ?? []) {
      const key = item.category as MenuCategory;
      const list = byCategory.get(key);
      if (list) list.push(item);
      else byCategory.set(key, [item]);
    }
    return MENU_CATEGORY_KEYS.filter((key) => byCategory.has(key)).map((key) => ({
      category: key,
      items: byCategory.get(key)!,
    }));
  }, [items]);

  // Toggled straight from the list, because "we've run out of pilau" is the
  // single most frequent menu edit and shouldn't need a dialog.
  const toggleAvailable = async (item: MenuItem, available: boolean) => {
    // Optimistic: the switch has to feel instant mid-service.
    setItems((current) =>
      (current ?? []).map((i) => (i.id === item.id ? { ...i, is_available: available } : i)),
    );
    const { error } = await supabase
      .from("menu_items")
      .update({ is_available: available })
      .eq("id", item.id);
    if (error) {
      toast.error(toUserMessage(error, "Couldn't update that dish."));
      void load();
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", deleting.id);
      if (error) throw error;
      // order_items keeps its own name/price snapshot, so past orders survive
      // this delete intact (menu_item_id just becomes null).
      await deletePhoto(deleting.photo_url);
      toast.success("Dish removed");
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't remove that dish."));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Menu</h1>
          <p className="text-sm text-muted-foreground">
            {items ? `${items.length} dishes` : "Loading…"}
            {restaurant.status !== "active" && " · not visible to customers yet"}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add dish
        </Button>
      </div>

      {items === null && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {items?.length === 0 && (
        <div className="grid place-items-center rounded-2xl border border-dashed px-4 py-16 text-center">
          <UtensilsCrossed className="h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-medium">Your menu is empty</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add the dishes you actually cook. Customers search by dish name, so "Ugali na maharage"
            finds you where "Combo 1" won't.
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add your first dish
          </Button>
        </div>
      )}

      {grouped.map(({ category, items: categoryItems }) => {
        const meta = MENU_CATEGORIES[category];
        return (
          <section key={category}>
            <h2 className="flex items-center gap-2 py-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <meta.Icon className="h-4 w-4" />
              {categoryLabelEn(category)}
            </h2>
            <div className="space-y-2">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.photo_url ? (
                      <img
                        src={item.photo_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-muted-foreground">
                        <UtensilsCrossed className="h-5 w-5" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatTsh(Number(item.price))} · {item.prep_minutes} min
                    </p>
                  </div>

                  <label className="flex shrink-0 items-center gap-2">
                    <span className="sr-only">{item.name} available</span>
                    <Switch
                      checked={item.is_available}
                      onCheckedChange={(checked) => toggleAvailable(item, checked)}
                    />
                  </label>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => {
                      setEditing(item);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {user && (
        <MenuItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          restaurantId={restaurant.id}
          ownerId={user.id}
          item={editing}
          onSaved={load}
        />
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from your menu and from search. Past orders that included it are not
              affected. If you've just run out, switch it to unavailable instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
