import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Banknote, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import type { Database } from "@/integrations/supabase/types";

type Received = Database["public"]["Tables"]["received_payments"]["Row"];

/**
 * The ledger of money the platform has actually seen arrive.
 *
 * Recording a line here is what lets a vendor's reference auto-confirm: the
 * matcher only honours a reference that lines up with an unclaimed entry worth
 * at least the fee. Nothing here activates anything by itself — it records
 * what was received, and registrations reconcile against it.
 *
 * Written straight from the browser rather than through a server function:
 * RLS already restricts this table to admins, so a server round-trip would add
 * a service-role dependency without adding a check.
 */
export default function ReceivedPaymentsPanel() {
  const [rows, setRows] = useState<Received[] | null>(null);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("5000");
  const [msisdn, setMsisdn] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("received_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(toUserMessage(error, "Couldn't load received payments."));
      setRows([]);
      return;
    }
    setRows(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const record = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("received_payments").insert({
        reference: reference.trim(),
        amount: Number(amount) || 0,
        msisdn: msisdn.trim() || null,
      });
      if (error) throw error;

      setReference("");
      setMsisdn("");
      await load();
      toast.success("Recorded. Any registration quoting this reference will activate itself.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The unique index on the normalised reference is the thing stopping one
      // real payment from activating two listings, so name it plainly.
      if (message.includes("received_payments_reference_key_idx")) {
        toast.error("That reference is already in the ledger.");
      } else {
        toast.error(toUserMessage(err, "Couldn't record that payment."));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Banknote className="h-4 w-4 text-primary" />
        <h2 className="font-display text-base font-bold">Money received</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Upcoming
        </span>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Registration fees are collected in cash for now, so this sits idle: with nothing recorded
        here, nothing auto-confirms and every payment waits for you below. It is ready for the day
        mobile money is switched on — enter each payment as it lands, and a restaurant submitting a
        matching reference activates itself.
      </p>

      <form onSubmit={record} className="grid gap-2 sm:grid-cols-[2fr_1fr_1.5fr_auto]">
        <Input
          aria-label="Transaction reference"
          placeholder="Transaction reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          minLength={4}
        />
        <Input
          aria-label="Amount"
          type="number"
          min={0}
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Input
          aria-label="Payer phone"
          placeholder="Payer phone (optional)"
          value={msisdn}
          onChange={(e) => setMsisdn(e.target.value)}
        />
        <Button type="submit" disabled={saving || reference.trim().length < 4}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Record
        </Button>
      </form>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nothing recorded yet. Payments you add here are matched against registration references
          automatically.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-mono font-medium">{row.reference}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatTsh(Number(row.amount))}
              </span>
              {row.msisdn && <span className="text-xs text-muted-foreground">{row.msisdn}</span>}
              <span className="ml-auto shrink-0">
                {row.claimed_by ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <Link2 className="h-3 w-3" />
                    Matched
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Waiting</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
