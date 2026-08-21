import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, LocateFixed, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";
import { formatTsh, getCurrentPosition } from "@/lib/geo";
import { DEFAULT_HOURS } from "@/lib/hours";
import { findTown, TOWNS } from "@/lib/towns";
import { slugify } from "@/lib/vendorContext";

export const Route = createFileRoute("/vendor/setup")({ component: VendorSetup });

const REGISTRATION_FEE = Number(import.meta.env.VITE_REGISTRATION_FEE_TZS ?? 5000);

function VendorSetup() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [town, setTown] = useState("Moshi");
  const [address, setAddress] = useState("");
  const [prepMinutes, setPrepMinutes] = useState(20);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { role: "restaurant", mode: "signup" } });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
    if (profile?.town) setTown(profile.town);
  }, [profile]);

  const locate = async () => {
    setLocating(true);
    try {
      const fix = await getCurrentPosition();
      if (!fix) {
        toast.error("Couldn't read your location. Check browser permissions.");
        return;
      }
      setCoords(fix);
      toast.success("Location captured");
    } finally {
      setLocating(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Falling back to the town centre keeps a restaurant that can't or won't
    // share GPS from being undiscoverable — they can correct the pin later on
    // the profile page, and until then distance is at least approximately
    // right rather than absent.
    const centre = findTown(town) ?? TOWNS[0];
    const point = coords ?? { lat: centre.lat, lng: centre.lng };

    setSaving(true);
    try {
      // The slug is permanent once set (a guard trigger enforces it), so a
      // collision has to be resolved here rather than by editing it later.
      const base = slugify(name) || "restaurant";
      let slug = base;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: taken } = await supabase
          .from("restaurants")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!taken) break;
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const { data: created, error } = await supabase
        .from("restaurants")
        .insert({
          owner_id: user.id,
          name: name.trim(),
          slug,
          description: description.trim() || null,
          phone: phone.trim() || null,
          town,
          address: address.trim(),
          lat: point.lat,
          lng: point.lng,
          avg_prep_minutes: prepMinutes,
          // RLS requires a new listing to start here; only a confirmed
          // payment (or an admin) can move it on.
          status: "pending_payment",
        })
        .select("id")
        .single();

      if (error) throw error;

      // Seed a sensible week so the listing isn't "closed" on every day the
      // owner hasn't got round to configuring yet.
      const { error: hoursError } = await supabase.from("restaurant_hours").insert(
        DEFAULT_HOURS.map((day) => ({
          restaurant_id: created.id,
          day_of_week: day.day_of_week,
          opens_at: day.opens_at,
          closes_at: day.closes_at,
          is_closed: day.is_closed,
        })),
      );
      if (hoursError) console.error(hoursError);

      toast.success("Listing created — pay the registration fee to go live.");
      navigate({ to: "/vendor/billing" });
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't create your listing."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elegant">
          <Store className="h-5 w-5" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold">Set up your restaurant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This is what customers see when they search for food near you. You can change everything
          except the web address later.
        </p>

        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-2xl border bg-card p-4 shadow-card"
        >
          <div>
            <label htmlFor="setup-name" className="mb-1.5 block text-sm font-medium">
              Restaurant or hotel name
            </label>
            <Input
              id="setup-name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mama Ngoma Kitchen"
            />
            {name.trim() && (
              <p className="mt-1 text-xs text-muted-foreground">
                Your page: /r/{slugify(name) || "restaurant"}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="setup-description" className="mb-1.5 block text-sm font-medium">
              Short description
            </label>
            <Textarea
              id="setup-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="Home-style Tanzanian food, cooked to order."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-sm font-medium">Town</span>
              <Select value={town} onValueChange={setTown}>
                <SelectTrigger aria-label="Town">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOWNS.map((tw) => (
                    <SelectItem key={tw.name} value={tw.name}>
                      {tw.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="setup-phone" className="mb-1.5 block text-sm font-medium">
                Phone
              </label>
              <Input
                id="setup-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
              />
            </div>
          </div>

          <div>
            <label htmlFor="setup-address" className="mb-1.5 block text-sm font-medium">
              Street address
            </label>
            <Input
              id="setup-address"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Kaunda Street, near CCM building"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Map location</span>
            <Button
              type="button"
              variant={coords ? "default" : "outline"}
              className="h-10 w-full"
              onClick={locate}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {coords ? "Location captured — tap to update" : "Use my current location"}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : `Stand at your restaurant and tap this so customers see the right distance. Skipping uses the centre of ${town}.`}
            </p>
          </div>

          <div>
            <label htmlFor="setup-prep" className="mb-1.5 block text-sm font-medium">
              Typical cooking time (minutes)
            </label>
            <Input
              id="setup-prep"
              type="number"
              min={1}
              max={240}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              A rough average. Each dish gets its own cooking time on the menu.
            </p>
          </div>

          <p className="rounded-xl bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            After this you'll pay a one-time {formatTsh(REGISTRATION_FEE)} registration fee. Your
            menu stays private until the payment is confirmed.
          </p>

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full"
            disabled={saving || !name.trim() || !address.trim()}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create listing
          </Button>
        </form>
      </div>
    </div>
  );
}
