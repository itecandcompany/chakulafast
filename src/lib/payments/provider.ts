/**
 * Payment provider contract for the one-time restaurant registration fee.
 *
 * There is exactly one thing the platform charges for, so this interface is
 * deliberately small. It exists so that swapping the manual flow for a real
 * mobile money API (M-Pesa, Tigo Pesa, Airtel Money, HaloPesa) is a change
 * in one file rather than a change everywhere a payment is touched.
 *
 * Whatever a provider does, the outcome is always the same database
 * transition — registration_payments.status → 'confirmed' — and the
 * activate_restaurant_on_payment() trigger takes it from there. No provider
 * ever writes to `restaurants` directly.
 */
import type { Database } from "@/integrations/supabase/types";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export type InitiateInput = {
  paymentId: string;
  restaurantId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  /** Payer's phone number, in local or E.164 form. */
  msisdn: string | null;
  /** Transaction reference the vendor copied from their confirmation SMS. */
  reference: string | null;
};

/**
 * What the vendor should see next. Each variant maps to a different piece of
 * UI on the billing page, which is why this is a union rather than a boolean.
 */
export type InitiateResult =
  /** Nothing more to automate — a human has to verify and confirm. */
  | { kind: "awaiting_confirmation"; message: string }
  /** Provider wants the payer to approve a prompt on their handset. */
  | { kind: "push_sent"; message: string; providerRef: string }
  /** Provider hosts its own checkout page. */
  | { kind: "redirect"; url: string }
  /** Settled synchronously; the caller marks the payment confirmed. */
  | { kind: "confirmed"; providerRef: string | null };

export type VerifyResult = {
  status: PaymentStatus;
  providerRef: string | null;
  /** Safe to show the vendor; never raw provider error text. */
  message: string;
};

export type WebhookEvent = {
  paymentId: string;
  status: PaymentStatus;
  providerRef: string | null;
  payload: unknown;
};

export interface PaymentProvider {
  readonly id: string;
  /** Human-readable name for the billing page and the admin console. */
  readonly label: string;
  /** Methods this provider can actually process. */
  readonly methods: readonly PaymentMethod[];
  /** True when a person has to confirm the payment by hand. */
  readonly requiresManualConfirmation: boolean;

  initiate(input: InitiateInput): Promise<InitiateResult>;

  /** Poll a payment's current state. Called by the vendor's "check again". */
  verify(paymentId: string, providerRef: string | null): Promise<VerifyResult>;

  /**
   * Parse and authenticate a provider callback. Returning null means "not a
   * valid event for us" and the route replies 400 — never trust an
   * unverified webhook body enough to confirm a payment from it.
   */
  parseWebhook?(request: Request): Promise<WebhookEvent | null>;
}
