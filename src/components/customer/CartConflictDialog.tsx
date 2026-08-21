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
import { useT } from "@/lib/i18n";
import type { PendingAdd } from "@/hooks/useAddToCart";
import type { CartRestaurant } from "@/lib/cart";

/**
 * "Your basket has food from X — start a new one at Y?"
 *
 * A pre-order is a promise to one kitchen about one arrival time, so a basket
 * can only hold one restaurant. This is the confirmation for clearing it.
 */
export default function CartConflictDialog({
  pending,
  currentRestaurant,
  onConfirm,
  onCancel,
}: {
  pending: PendingAdd | null;
  currentRestaurant: CartRestaurant | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cart.switchRestaurant")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("cart.switchRestaurantBody", {
              current: currentRestaurant?.name ?? "",
              next: pending?.restaurant.name ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("cart.switchConfirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
