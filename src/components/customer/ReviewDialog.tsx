import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarInput } from "@/components/StarRating";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { useT } from "@/lib/i18n";

/**
 * Post-collection review.
 *
 * The "was it ready when you arrived?" question is the one that matters most
 * here — it measures the single promise the platform makes, and it's a yes/no
 * a customer can answer honestly in one tap, unlike a star rating that ends
 * up measuring whether they liked the food.
 */
export default function ReviewDialog({
  open,
  onOpenChange,
  orderId,
  restaurantId,
  customerId,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  restaurantId: string;
  customerId: string;
  onSubmitted?: () => void;
}) {
  const t = useT();
  const [stars, setStars] = useState(0);
  const [onTime, setOnTime] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (stars < 1) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        order_id: orderId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        stars,
        was_ready_on_time: onTime,
        comment: comment.trim() || null,
      });
      if (error) throw error;

      toast.success(t("review.thanks"));
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      toast.error(toUserMessage(err, t("common.somethingWrong")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("review.title")}</DialogTitle>
          <DialogDescription>{t("review.stars")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StarInput value={stars} onChange={setStars} />

          <div>
            <p className="mb-2 text-sm font-medium">{t("review.onTime")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={onTime === true ? "default" : "outline"}
                className="flex-1"
                onClick={() => setOnTime(true)}
              >
                {t("review.yes")}
              </Button>
              <Button
                type="button"
                variant={onTime === false ? "default" : "outline"}
                className="flex-1"
                onClick={() => setOnTime(false)}
              >
                {t("review.no")}
              </Button>
            </div>
          </div>

          <div>
            <label htmlFor="review-comment" className="mb-1.5 block text-sm font-medium">
              {t("review.comment")}
            </label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("review.commentPlaceholder")}
              maxLength={1000}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || stars < 1}>
            {t("review.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
