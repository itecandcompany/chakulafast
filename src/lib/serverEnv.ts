/**
 * Server-side Supabase configuration, resolved once.
 *
 * The project URL and the publishable key are *public* values — they ship
 * inside the browser bundle by design, and RLS is what protects the data. So
 * when only the `VITE_`-prefixed copies are configured, reading those on the
 * server discloses nothing and removes an entire class of outage: a deployment
 * whose pages render perfectly while every server function returns 500,
 * because the browser found its keys and the server did not.
 *
 * That exact misconfiguration cost a real afternoon. Vercel treats
 * `SUPABASE_URL` and `VITE_SUPABASE_URL` as unrelated variables, and setting
 * only the second is the obvious mistake to make: it is the one the app tells
 * you about at setup time.
 */

/** Project URL. Public — it is in the client bundle. */
export function serverSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

/** Publishable (anon) key. Public — it is in the client bundle. */
export function serverSupabasePublishableKey(): string | undefined {
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

/**
 * Service-role key. Deliberately has NO `VITE_` fallback and never will.
 *
 * Anything named `VITE_*` is inlined into the browser bundle by Vite. A
 * fallback here would mean that setting `VITE_SUPABASE_SERVICE_ROLE_KEY` —
 * a plausible thing for someone to try when server functions fail — would
 * publish a key that bypasses every row-level security policy to every
 * visitor. The asymmetry with the two above is the entire point: those are
 * public values, this one owns the database.
 */
export function serverSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Names the missing variable, so the error says what to go and set. */
export function describeMissingServerEnv(needsServiceRole = false): string {
  const missing: string[] = [];
  if (!serverSupabaseUrl()) missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
  if (!serverSupabasePublishableKey()) {
    missing.push("SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)");
  }
  if (needsServiceRole && !serverSupabaseServiceRoleKey()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return `Server is missing ${missing.join(", ")}. Set it in the deployment's environment variables and redeploy — env changes do not apply to an already-running deployment.`;
}
