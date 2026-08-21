import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, UtensilsCrossed } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { categoryLabelEn, MENU_CATEGORY_KEYS, type MenuCategory } from "@/lib/menuCategories";
import { deletePhoto, uploadPhoto, validateImage } from "@/lib/photos";
import type { Database } from "@/integrations/supabase/types";

export type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];

const EMPTY = {
  name: "",
  description: "",
  price: "",
  category: "local" as MenuCategory,
  prepMinutes: "15",
  isAvailable: true,
  photoUrl: null as string | null,
};

export default function MenuItemDialog({
  open,
  onOpenChange,
  restaurantId,
  ownerId,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  ownerId: string;
  /** null = creating a new dish. */
  item: MenuItem | null;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            name: item.name,
            description: item.description ?? "",
            price: String(item.price),
            category: item.category as MenuCategory,
            prepMinutes: String(item.prep_minutes),
            isAvailable: item.is_available,
            photoUrl: item.photo_url,
          }
        : EMPTY,
    );
  }, [open, item]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhoto(ownerId, file, "dish");
      setForm((f) => ({ ...f, photoUrl: url }));
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't upload that photo."));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const price = Number(form.price);
    const prep = Number(form.prepMinutes);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0) return;

    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        category: form.category,
        prep_minutes: Math.min(240, Math.max(1, prep || 15)),
        is_available: form.isAvailable,
        photo_url: form.photoUrl,
      };

      if (item) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", item.id);
        if (error) throw error;
        // Replacing a photo leaves the previous file orphaned in the bucket.
        if (item.photo_url && item.photo_url !== form.photoUrl) {
          await deletePhoto(item.photo_url);
        }
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
      }

      toast.success(item ? "Dish updated" : "Dish added");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't save that dish."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Edit dish" : "Add a dish"}</DialogTitle>
          <DialogDescription>
            Cooking time is what customers see, and what decides when the kitchen has to start.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ---------- Photo ---------- */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-20 w-20 overflow-hidden rounded-xl bg-muted">
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground">
                    <UtensilsCrossed className="h-6 w-6" />
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Upload dish photo"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-card disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
            </div>

            {form.photoUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setForm((f) => ({ ...f, photoUrl: null }))}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove photo
              </Button>
            )}
          </div>

          <div>
            <label htmlFor="dish-name" className="mb-1.5 block text-sm font-medium">
              Dish name
            </label>
            <Input
              id="dish-name"
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Ugali na nyama choma"
            />
          </div>

          <div>
            <label htmlFor="dish-description" className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <Textarea
              id="dish-description"
              rows={2}
              maxLength={300}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What's in it, portion size, anything worth knowing."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dish-price" className="mb-1.5 block text-sm font-medium">
                Price (TSh)
              </label>
              <Input
                id="dish-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>

            <div>
              <label htmlFor="dish-prep" className="mb-1.5 block text-sm font-medium">
                Cooking time (min)
              </label>
              <Input
                id="dish-prep"
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                value={form.prepMinutes}
                onChange={(e) => setForm((f) => ({ ...f, prepMinutes: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Category</span>
            <Select
              value={form.category}
              onValueChange={(v) => setForm((f) => ({ ...f, category: v as MenuCategory }))}
            >
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MENU_CATEGORY_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {categoryLabelEn(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Available now</span>
              <span className="block text-xs text-muted-foreground">
                Turn this off when you run out — the dish stays on your menu but can't be ordered.
              </span>
            </span>
            <Switch
              checked={form.isAvailable}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, isAvailable: checked }))}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name.trim() || form.price === ""}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {item ? "Save changes" : "Add dish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
