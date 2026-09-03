import { Flame } from "lucide-react";
import type { VendorOrder } from "./OrderTicket";

/**
 * What to put on the heat right now, counted by dish instead of by ticket.
 *
 * The ticket list below answers "which customers am I cooking for". A cook
 * standing at the stove has the other question — how many portions of each
 * dish — and answering it by reading six tickets and adding up in their head
 * is exactly where a rush goes wrong. Commercial kitchen displays group work
 * by station for this reason; at this app's scale, one line per dish is the
 * same idea without the hardware.
 *
 * This is deliberately a summary and not a control: every state change still
 * happens on the ticket that owns it, so there is one place where an order
 * can move and one place to look when something is wrong.
 */
export default function PrepQueue({ orders }: { orders: VendorOrder[] }) {
  const byDish = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      byDish.set(item.name, (byDish.get(item.name) ?? 0) + item.qty);
    }
  }

  if (byDish.size === 0) return null;

  // Biggest batch first — that is the one worth starting while the pan is
  // already hot. Ties break alphabetically so the list doesn't reshuffle
  // itself on every re-render.
  const dishes = [...byDish.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const portions = dishes.reduce((sum, [, qty]) => sum + qty, 0);

  return (
    <section className="rounded-2xl border border-orange-500/40 bg-orange-50 p-3 shadow-card dark:bg-orange-950/30">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        <h2 className="font-display text-sm font-bold text-orange-900 dark:text-orange-100">
          Start cooking now
        </h2>
        <span className="text-xs text-orange-800/80 dark:text-orange-200/80">
          {portions} {portions === 1 ? "portion" : "portions"} across {orders.length}{" "}
          {orders.length === 1 ? "order" : "orders"}
        </span>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {dishes.map(([name, qty]) => (
          <li
            key={name}
            className="rounded-lg bg-background/70 px-2 py-1 text-sm font-medium tabular-nums"
          >
            <span className="text-orange-700 dark:text-orange-300">{qty}×</span> {name}
          </li>
        ))}
      </ul>
    </section>
  );
}
