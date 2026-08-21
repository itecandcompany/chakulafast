import type {
  PaymentProvider,
  InitiateInput,
  InitiateResult,
  VerifyResult,
  WebhookEvent,
} from "./provider";

/**
 * Mobile money gateway — NOT IMPLEMENTED.
 *
 * This is a deliberate placeholder, not an oversight. Wiring up M-Pesa,
 * Tigo Pesa or Airtel Money needs a merchant account, a signed agreement and
 * credentials that can't be stubbed, so the app ships with `manual` selected
 * and this file marks out exactly where the real thing goes.
 *
 * To implement, an aggregator (Selcom, ClickPesa, Flutterwave, Pesapal…) is
 * usually far less work than three direct integrations: one set of
 * credentials, one webhook, all four networks. The shape below assumes that.
 *
 * Steps:
 *   1. Put the credentials in .env — never in this file:
 *        MOBILE_MONEY_BASE_URL, MOBILE_MONEY_API_KEY,
 *        MOBILE_MONEY_API_SECRET, MOBILE_MONEY_WEBHOOK_SECRET
 *   2. Fill in initiate(): request a USSD push to `input.msisdn` for
 *      `input.amount`, passing `input.paymentId` as your idempotency key so
 *      a retry can never charge twice. Return { kind: "push_sent" } with the
 *      provider's reference.
 *   3. Fill in verify(): query the transaction and map the provider's status
 *      onto our four values. Never return 'confirmed' on a timeout.
 *   4. Fill in parseWebhook(): verify the signature against
 *      MOBILE_MONEY_WEBHOOK_SECRET FIRST and return null if it fails —
 *      an unauthenticated callback that reaches the database is a free
 *      restaurant listing for anyone who can guess the URL. Then look the
 *      payment up by your idempotency key and return the event.
 *   5. Set PAYMENT_PROVIDER=mobile_money in .env.
 *
 * Nothing else in the app needs to change: confirmation still flows through
 * registration_payments → activate_restaurant_on_payment().
 */
export const mobileMoneyProvider: PaymentProvider = {
  id: "mobile_money",
  label: "Mobile money (automatic)",
  methods: ["mpesa", "tigopesa", "airtel", "halopesa"],
  requiresManualConfirmation: false,

  async initiate(_input: InitiateInput): Promise<InitiateResult> {
    throw new Error(
      "Mobile money payments are not configured yet. Set PAYMENT_PROVIDER=manual, or implement src/lib/payments/mobileMoney.ts.",
    );
  },

  async verify(_paymentId: string, _providerRef: string | null): Promise<VerifyResult> {
    throw new Error("Mobile money payments are not configured yet.");
  },

  async parseWebhook(_request: Request): Promise<WebhookEvent | null> {
    // Returning null makes the webhook route reply 400, which is the correct
    // behaviour for an unconfigured provider: reject, don't silently accept.
    return null;
  },
};
