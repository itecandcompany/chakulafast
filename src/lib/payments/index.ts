import type { PaymentProvider } from "./provider";
import { manualProvider } from "./manual";
import { mobileMoneyProvider } from "./mobileMoney";

export type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  VerifyResult,
  WebhookEvent,
  PaymentMethod,
  PaymentStatus,
} from "./provider";
export { manualProvider } from "./manual";
export { mobileMoneyProvider } from "./mobileMoney";

const PROVIDERS: Record<string, PaymentProvider> = {
  manual: manualProvider,
  mobile_money: mobileMoneyProvider,
};

/**
 * Server-side only — reads a non-VITE_ env var, so calling this from the
 * browser would always fall through to `manual` regardless of configuration.
 * The billing page gets what it needs to render from a server function.
 */
export function getPaymentProvider(): PaymentProvider {
  const configured = process.env.PAYMENT_PROVIDER?.trim() || "manual";
  const provider = PROVIDERS[configured];
  if (!provider) {
    console.warn(`Unknown PAYMENT_PROVIDER "${configured}" — falling back to manual.`);
    return manualProvider;
  }
  return provider;
}

/** Mobile money networks a vendor can pick from when recording a payment. */
export const PAYMENT_METHOD_LABELS = {
  mpesa: "M-Pesa (Vodacom)",
  tigopesa: "Mixx by Yas (Tigo Pesa)",
  airtel: "Airtel Money",
  halopesa: "HaloPesa",
  bank: "Bank transfer",
  cash: "Cash",
  manual: "Other",
} as const;
