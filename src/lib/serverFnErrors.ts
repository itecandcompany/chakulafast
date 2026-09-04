/**
 * Turns a failed server-function call into a sentence naming the actual cause.
 *
 * A TanStack server function whose middleware throws a Response does not
 * reject on the client. It *resolves*, with an envelope shaped like
 * `{ status, unhandled: true, message: "HTTPError" }` — and the text of the
 * thrown Response is discarded on the way. So the only thing that survives the
 * trip is the status code, and reading it is the difference between "something
 * went wrong" and "your email address is not confirmed".
 *
 * This cost real time to find, in both directions: the discarded body made a
 * 401 and a genuine 500 look identical from the outside, which is exactly how
 * a missing environment variable and a missing auth header get confused for
 * one another.
 */

type ErrorEnvelope = { status?: number; unhandled?: boolean };

/** True when a resolved value is one of those envelopes rather than real data. */
export function isServerFnFailure(value: unknown): value is ErrorEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    "status" in value &&
    typeof (value as ErrorEnvelope).status === "number"
  );
}

/**
 * @param action  Phrased to follow "couldn't" — e.g. "load your billing details".
 */
export function describeServerFnFailure(result: unknown, action: string): string {
  const envelope = isServerFnFailure(result) ? result : undefined;

  // `unhandled` means the status is TanStack's own, not the one the middleware
  // threw. Verified by experiment: a middleware throwing a 401 arrives here as
  // status 500. Naming a single cause off that number would be a guess dressed
  // up as a diagnosis — and sending someone to check environment variables
  // when they are simply signed out is worse than admitting the ambiguity.
  if (envelope?.unhandled) {
    return (
      `The server rejected the request, so it couldn't ${action}. ` +
      `Three things cause this, in rough order of likelihood: your session expired (sign out and back in); ` +
      `this account's email address is unconfirmed, which blocks every privileged action while still letting the page load; ` +
      `or the deployment is missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY, which needs a redeploy after adding them.`
    );
  }

  switch (envelope?.status) {
    case 401:
      return `Your session has expired, so the server couldn't ${action}. Sign out and sign in again.`;
    case 403:
      return `The server refused the request, so it couldn't ${action}. This normally means the email address on this account has not been confirmed — check the inbox for the confirmation link, or turn off email confirmation in Supabase under Authentication → Providers.`;
    case 429:
      return `Too many requests in a short time, so the server couldn't ${action}. Wait a minute and try again.`;
    default:
      return envelope?.status
        ? `The server couldn't ${action} (error ${envelope.status}).`
        : `The server couldn't ${action}.`;
  }
}
