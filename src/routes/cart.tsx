import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AppTabBar from "@/components/AppTabBar";
import ArrivalTimePicker, { type ArrivalChoice } from "@/components/customer/ArrivalTimePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cartPrepMinutes, cartSubtotal, useCart, useCartHydrated } from "@/lib/cart";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/cart")({
  // Reads the persisted basket and the customer's own session — there is
  // nothing meaningful to render on the server.
  ssr: false,
  component: CartPage,
});

function CartPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const restaurant = useCart((s) => s.restaurant);
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const hydrated = useCartHydrated();

  const [arrival, setArrival] = useState<ArrivalChoice>({
    mode: "manual",
    minutes: 15,
    position: null,
  });
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  const subtotal = cartSubtotal(lines);
  const prepMinutes = cartPrepMinutes(lines);

  const placeOrder = async () => {
    if (!restaurant || lines.length === 0) return;

    if (!user) {
      navigate({
        to: "/auth",
        search: { role: "customer", mode: "signin", redirect: "/cart" },
      });
      return;
    }

    setPlacing(true);
    let orderId: string | null = null;

    try {
      // Totals, prep time and the order code are all filled in by database
      // triggers — nothing derived is trusted from here.
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: user.id,
          restaurant_id: restaurant.id,
          arrival_mode: arrival.mode,
          arrival_minutes: arrival.minutes,
          note: note.trim() || null,
          customer_phone: phone.trim() || null,
          customer_lat: arrival.position?.lat ?? null,
          customer_lng: arrival.position?.lng ?? null,
        })
        .select("id, code")
        .single();

      if (orderError) throw orderError;
      orderId = order.id;

      // Prices are re-read from the live menu by prepare_order_item(), so a
      // dish that just went out of stock or changed price fails here rather
      // than becoming a bad order.
      const { error: itemsError } = await supabase.from("order_items").insert(
        lines.map((line) => ({
          order_id: order.id,
          menu_item_id: line.menuItemId,
          name: line.name,
          unit_price: line.unitPrice,
          prep_minutes: line.prepMinutes,
          qty: line.qty,
        })),
      );

      if (itemsError) throw itemsError;

      clear();
      toast.success(`${t("order.code", { code: order.code })} — ${t("status.pending")}`);
      navigate({ to: "/orders" });
    } catch (err) {
      // An order row without lines would sit in the kitchen's queue as an
      // empty ticket. Cancelling it is the one transition a customer is
      // allowed to make on a pending order, so this always succeeds.
      if (orderId) {
        await supabase
          .from("orders")
          .update({ status: "cancelled", cancel_reason: "Could not be completed" })
          .eq("id", orderId);
      }
      toast.error(toUserMessage(err, "Couldn't place your order."));
    } finally {
      setPlacing(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="grid min-h-[var(--app-100vh)] place-items-center text-muted-foreground lg:pl-60">
        {t("common.loading")}
      </div>
    );
  }

  if (!restaurant || lines.length === 0) {
    return (
      <div className="min-h-[var(--app-100vh)] bg-background pb-24 lg:pb-8 lg:pl-60">
        <div className="mx-auto grid max-w-3xl place-items-center px-4 py-20 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 font-display text-xl font-bold">{t("cart.empty")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("cart.emptyHint")}</p>
          <Button asChild className="mt-4">
            <Link to="/search" search={{}}>
              {t("nav.search")}
            </Link>
          </Button>
        </div>
        <AppTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-[var(--app-100vh)] bg-background pb-40 lg:pb-8 lg:pl-60">
      <header className="border-b bg-background px-4 py-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-xl font-bold">{t("cart.title")}</h1>
          <Link
            to="/r/$slug"
            params={{ slug: restaurant.slug }}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("cart.at", { restaurant: restaurant.name })}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-6 lg:px-10">
        {/* ---------- Lines ---------- */}
        <section className="divide-y rounded-2xl border bg-card">
          {lines.map((line) => (
            <div key={line.menuItemId} className="flex items-center gap-3 p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {line.photoUrl ? (
                  <img src={line.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground">
                    <UtensilsCrossed className="h-5 w-5" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{line.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatTsh(line.unitPrice)} · {t("common.minutes", { count: line.prepMinutes })}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 rounded-full border p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label="Decrease quantity"
                  onClick={() => setQty(line.menuItemId, line.qty - 1)}
                >
                  {line.qty === 1 ? (
                    <Trash2 className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                </Button>
                <span className="w-5 text-center text-sm font-semibold tabular-nums">
                  {line.qty}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  aria-label="Increase quantity"
                  onClick={() => setQty(line.menuItemId, line.qty + 1)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <p className="w-20 shrink-0 text-right font-display font-bold">
                {formatTsh(line.unitPrice * line.qty)}
              </p>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                aria-label={`${t("cart.remove")} ${line.name}`}
                onClick={() => remove(line.menuItemId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </section>

        {/* ---------- Arrival ---------- */}
        <ArrivalTimePicker
          value={arrival}
          onChange={setArrival}
          destination={{ lat: restaurant.lat, lng: restaurant.lng }}
          prepMinutes={prepMinutes}
        />

        {/* ---------- Details ---------- */}
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <div>
            <label htmlFor="cart-phone" className="mb-1.5 block text-sm font-medium">
              {t("cart.phone")}
            </label>
            <Input
              id="cart-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("cart.phoneHint")}</p>
          </div>

          <div>
            <label htmlFor="cart-note" className="mb-1.5 block text-sm font-medium">
              {t("cart.note")}{" "}
              <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
            </label>
            <Textarea
              id="cart-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("cart.notePlaceholder")}
              maxLength={280}
              rows={2}
            />
          </div>
        </section>
      </main>

      {/* ---------- Sticky total + submit ---------- */}
      <div className="fixed inset-x-0 bottom-[72px] z-40 mx-auto max-w-2xl border-t bg-background/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60 lg:max-w-none lg:px-10">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t("cart.subtotal")}</p>
            <p className="font-display text-lg font-bold leading-tight">{formatTsh(subtotal)}</p>
          </div>
          <Button size="lg" className="h-12 flex-1" onClick={placeOrder} disabled={placing}>
            {placing ? t("cart.placing") : user ? t("cart.place") : t("cart.signInFirst")}
          </Button>
        </div>
      </div>

      <AppTabBar />
    </div>
  );
}
