import type { PaymentProvider, InitiateResult, VerifyResult } from "./provider";

/**
 * The default provider: the restaurant pays into the platform's till by
 * mobile money, records the transaction reference from the confirmation SMS,
 * and an administrator verifies it against the till statement before marking
 * it received.
 *
 * Unglamorous, but it is how a lot of small Tanzanian platforms actually
 * start — and because it satisfies the same interface as a real gateway,
 * nothing else in the app has to know it's a person doing the checking.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "Mobile money (manually verified)",
  methods: ["mpesa", "tigopesa", "airtel", "halopesa", "bank", "cash", "manual"],
  requiresManualConfirmation: true,

  async initiate(): Promise<InitiateResult> {
    return {
      kind: "awaiting_confirmation",
      message:
        "Payment recorded. An administrator will verify your reference and activate your listing — usually within a few hours.",
    };
  },

  async verify(): Promise<VerifyResult> {
    // There is nothing to poll: the state in our own database is the only
    // state there is. The caller re-reads the row and reports that instead.
    return {
      status: "submitted",
      providerRef: null,
      message: "Waiting for an administrator to verify your payment.",
    };
  },
};
