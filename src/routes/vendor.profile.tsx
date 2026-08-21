import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ExternalLink, Loader2, LocateFixed, UtensilsCrossed } from "lucide-react";
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
import HoursEditor from "@/components/vendor/HoursEditor";
import RestaurantMap from "@/components/RestaurantMap";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toUserMessage } from "@/lib/errorMessages";
import { getCurrentPosition } from "@/lib/geo";
import { uploadPhoto, validateImage } from "@/lib/photos";
import { TOWNS } from "@/lib/towns";
import { useVendor } from "@/lib/vendorContext";

export const Route = createFileRoute("/vendor/profile")({ component: VendorProfile });

function VendorProfile() {
  const { restaurant, refresh } = useVendor();
  const { user } = useAuth();
  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(restaurant.name);
  const [description, setDescription] = useState(restaurant.description ?? "");
  const [phone, setPhone] = useState(restaurant.phone ?? "");
  const [town, setTown] = useState(restaurant.town);
  const [address, setAddress] = useState(restaurant.address);
  const [prepMinutes, setPrepMinutes] = useState(String(restaurant.avg_prep_minutes));
  const [coords, setCoords] = useState({ lat: restaurant.lat, lng: restaurant.lng });
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  useEffect(() => {
    setName(restaurant.name);
    setDescription(restaurant.description ?? "");
    setPhone(restaurant.phone ?? "");
    setTown(restaurant.town);
    setAddress(restaurant.address);
    setPrepMinutes(String(restaurant.avg_prep_minutes));
    setCoords({ lat: restaurant.lat, lng: restaurant.lng });
  }, [restaurant]);

  const save = async () => {
    setSaving(true);
    try {
      // `status`, `slug`, `rating` are all rejected by guard_restaurant_update()
      // if sent from here — this deliberately only submits what an owner owns.
      const { error } = await supabase
        .from("restaurants")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          phone: phone.trim() || null,
          town,
          address: address.trim(),
          lat: coords.lat,
          lng: coords.lng,
          avg_prep_minutes: Math.min(240, Math.max(1, Number(prepMinutes) || 20)),
        })
        .eq("id", restaurant.id);
      if (error) throw error;
      await refresh();
      toast.success("Restaurant details saved");
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't save your details."));
    } finally {
      setSaving(false);
    }
  };

  const locate = async () => {
    setLocating(true);
    try {
      const fix = await getCurrentPosition();
      if (!fix) {
        toast.error("Couldn't read your location. Check browser permissions.");
        return;
      }
      setCoords(fix);
      toast.success("Pin moved — save to apply.");
    } finally {
      setLocating(false);
    }
  };

  const pickImage = async (file: File | undefined, kind: "logo" | "cover") => {
    if (!file || !user) return;
    const problem = validateImage(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(kind);
    try {
      const url = await uploadPhoto(user.id, file, kind);
      const { error } = await supabase
        .from("restaurants")
        .update(kind === "logo" ? { logo_url: url } : { cover_url: url })
        .eq("id", restaurant.id);
      if (error) throw error;
      await refresh();
      toast.success("Image updated");
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't upload that image."));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Restaurant details</h1>
          <p className="text-sm text-muted-foreground">
            What customers see on your page and in search results.
          </p>
        </div>
        {restaurant.status === "active" && (
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to="/r/$slug" params={{ slug: restaurant.slug }}>
              <ExternalLink className="h-3.5 w-3.5" />
              View public page
            </Link>
          </Button>
        )}
      </div>

      {/* ---------- Images ---------- */}
      <section className="rounded-2xl border bg-card shadow-card">
        <div className="relative h-32 overflow-hidden rounded-t-2xl bg-gradient-hero">
          {restaurant.cover_url && (
            <img src={restaurant.cover_url} alt="" className="h-full w-full object-cover" />
          )}
          <Button
            variant="secondary"
            size="sm"
            className="absolute right-3 top-3 h-8"
            onClick={() => coverRef.current?.click()}
            disabled={uploading !== null}
          >
            {uploading === "cover" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            Cover
          </Button>
          <input
            ref={coverRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0], "cover")}
          />
        </div>

        <div className="flex items-center gap-3 p-4">
          <div className="relative -mt-12">
            <div className="h-20 w-20 overflow-hidden rounded-2xl border-4 border-card bg-muted">
              {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-muted-foreground">
                  <UtensilsCrossed className="h-7 w-7" />
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={uploading !== null}
              aria-label="Upload logo"
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-card disabled:opacity-60"
            >
              {uploading === "logo" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={logoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0], "logo")}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A clear photo of your food works better as a cover than a logo does.
          </p>
        </div>
      </section>

      {/* ---------- Details ---------- */}
      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <Input
            id="profile-name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Web address stays /r/{restaurant.slug} — it can't change once customers have the link.
          </p>
        </div>

        <div>
          <label htmlFor="profile-description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <Textarea
            id="profile-description"
            rows={3}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-phone" className="mb-1.5 block text-sm font-medium">
              Phone
            </label>
            <Input
              id="profile-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

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
        </div>

        <div>
          <label htmlFor="profile-address" className="mb-1.5 block text-sm font-medium">
            Street address
          </label>
          <Input
            id="profile-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="profile-prep" className="mb-1.5 block text-sm font-medium">
            Typical cooking time (minutes)
          </label>
          <Input
            id="profile-prep"
            type="number"
            min={1}
            max={240}
            value={prepMinutes}
            onChange={(e) => setPrepMinutes(e.target.value)}
          />
        </div>

        <Button onClick={save} disabled={saving || !name.trim() || !address.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save details
        </Button>
      </section>

      {/* ---------- Map pin ---------- */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          <h2 className="font-display text-base font-bold">Map location</h2>
          <p className="text-sm text-muted-foreground">
            This is what "2.3 km away" is measured from. Stand at your door and update it.
          </p>
        </div>

        <RestaurantMap
          center={[coords.lat, coords.lng]}
          restaurants={[
            {
              id: restaurant.id,
              name: restaurant.name,
              slug: restaurant.slug,
              lat: coords.lat,
              lng: coords.lng,
              is_open: true,
            },
          ]}
          height={220}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={locate} disabled={locating}>
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            Use my current location
          </Button>
          <span className="text-xs text-muted-foreground">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Moving the pin only takes effect once you press “Save details”.
        </p>
      </section>

      {/* ---------- Hours ---------- */}
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
        <div>
          <h2 className="font-display text-base font-bold">Opening hours</h2>
          <p className="text-sm text-muted-foreground">
            Customers can still pre-order while you're closed — this controls the “Open now” badge
            and the “open only” filter.
          </p>
        </div>
        <HoursEditor restaurantId={restaurant.id} />
      </section>
    </div>
  );
}
