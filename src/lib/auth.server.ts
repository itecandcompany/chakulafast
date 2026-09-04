import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  describeMissingServerEnv,
  serverSupabasePublishableKey,
  serverSupabaseUrl,
} from "@/lib/serverEnv";

export const enforceEmailConfirmed = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });

    const token = authHeader.slice("Bearer ".length);
    const SUPABASE_URL = serverSupabaseUrl();
    const SUPABASE_PUBLISHABLE_KEY = serverSupabasePublishableKey();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
      throw new Response(describeMissingServerEnv(), { status: 500 });

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id || !data.user.email_confirmed_at) {
      throw new Response("Email not confirmed", { status: 403 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        claims: data.user,
      },
    });
  },
);
