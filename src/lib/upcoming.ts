import type { TKey } from "@/lib/i18n";

/**
 * Work that is planned and visible, rather than quietly absent.
 *
 * Saying "coming soon" out loud is the honest move when a customer or a
 * restaurant would otherwise wonder whether something is broken — a vendor
 * handing over cash should know mobile money is coming, not assume the
 * platform can't do it.
 *
 * Nothing goes on this list that isn't genuinely intended. An empty list is a
 * better outcome than a list that turns into a set of broken promises.
 */
export type UpcomingFeature = {
  id: string;
  title: TKey;
  body: TKey;
};

export const UPCOMING_FEATURES: readonly UpcomingFeature[] = [
  {
    id: "mobile-money",
    title: "upcoming.mobileMoney",
    body: "upcoming.mobileMoneyBody",
  },
  {
    id: "sms",
    title: "upcoming.sms",
    body: "upcoming.smsBody",
  },
];
