import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh } from "@/lib/geo";
import { qk } from "@/lib/queryClient";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettings });

async function fetchSettings() {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("registration_fee_tzs, currency, till_number, payment_instructions")
    .single();
  if (error) throw error;
  return data;
}

/**
 * The one screen that changes what every vendor sees on their billing page.
 *
 * Until now the till number and the payment instructions were only reachable
 * with SQL, which meant a fresh deployment quietly showed every restaurant the
 * placeholder text shipped in the migration — telling them to pay "the
 * platform till number" without ever naming it.
 *
 * Writes go straight to the table: RLS already restricts UPDATE on
 * platform_settings to admins, so a server function would add a hop without
 * adding a check.
 */
function AdminSettings() {
  const queryClient = useQueryClient();
  const [fee, setFee] = useState("");
  const [currency, setCurrency] = useState("");
  const [till, setTill] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: qk.platformSettings(),
    queryFn: fetchSettings,
  });

  // Bootstrap state is read separately: the RPC answers with a bare boolean
  // and never the claimed address, so this screen can report whether the door
  // is still open without exposing who can walk through it.
  const { data: bootstrapOpen } = useQuery({
    queryKey: ["admin", "bootstrap-open"],
    queryFn: async () => {
      const { data: open } = await supabase.rpc("bootstrap_available");
      return open === true;
    },
  });

  useEffect(() => {
    if (!data) return;
    setFee(String(data.registration_fee_tzs));
    setCurrency(data.currency);
    setTill(data.till_number ?? "");
    setInstructions(data.payment_instructions ?? "");
  }, [data]);

  const save = async () => {
    const parsedFee = Number(fee);
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      toast.error("The registration fee must be a number, and not negative.");
      return;
    }

    setSaving(true);
    try {
      const { error: saveError } = await supabase
        .from("platform_settings")
        // `id` is a single-row boolean primary key, always true — the table is
        // deliberately incapable of holding a second configuration.
        .update({
          registration_fee_tzs: parsedFee,
          currency: currency.trim() || "TZS",
          till_number: till.trim() || null,
          payment_instructions: instructions.trim() || null,
        })
        .eq("id", true);

      if (saveError) throw saveError;
      await queryClient.invalidateQueries({ queryKey: qk.platformSettings() });
      toast.success("Platform settings saved");
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't save those settings."));
    } finally {
      setSaving(false);
    }
  };

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">Platform settings</h1>
        <p className="text-sm text-muted-foreground">
          These reach every restaurant&apos;s billing page. Set the till number before you onboard
          anyone — otherwise vendors are told to pay a number nobody has given them.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {toUserMessage(error, "Couldn't load settings.")}
        </p>
      )}

      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-fee" className="mb-1.5 block text-sm font-medium">
              Registration fee
            </label>
            <Input
              id="settings-fee"
              type="number"
              min={0}
              step={100}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Currently {formatTsh(Number(fee) || 0)}. Charged once, per restaurant.
            </p>
          </div>

          <div>
            <label htmlFor="settings-currency" className="mb-1.5 block text-sm font-medium">
              Currency
            </label>
            <Input
              id="settings-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={8}
              placeholder="TZS"
            />
          </div>
        </div>

        <div>
          <label htmlFor="settings-till" className="mb-1.5 block text-sm font-medium">
            Till number
          </label>
          <Input
            id="settings-till"
            value={till}
            onChange={(e) => setTill(e.target.value)}
            placeholder="e.g. 5261XXX"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown on the vendor billing page. Leave empty while you are collecting cash in person.
          </p>
        </div>

        <div>
          <label htmlFor="settings-instructions" className="mb-1.5 block text-sm font-medium">
            Payment instructions
          </label>
          <Textarea
            id="settings-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={4}
            maxLength={600}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Written for a restaurant owner who has just registered and wants to know exactly what to
            do next.
          </p>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          {bootstrapOpen ? (
            <ShieldX className="h-4 w-4 text-amber-600" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          )}
          <h2 className="font-display text-base font-bold">First-admin bootstrap</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {bootstrapOpen
            ? "Still open. One named account can claim admin at /bootstrap. It closes for good the moment it is used, or as soon as this platform has any administrator."
            : "Closed. This platform has an administrator and the one-time claim is spent. Every further admin is granted from Users."}
        </p>
      </section>
    </div>
  );
}
