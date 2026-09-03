import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Records a privileged action in the admin audit log.
 *
 * Deliberately never throws. The log exists so a suspension or a payment
 * confirmation can be explained afterwards; if writing that record fails, the
 * action itself has already happened and refusing it at this point would leave
 * the platform in the state the log says it is not in. A failure here is worth
 * a server-side console line and nothing more.
 *
 * `subjectLabel` is the name as it stands right now, on purpose — the row has
 * to stay readable after the restaurant or account it describes is gone.
 */
export async function recordAdminAction(
  supabaseAdmin: SupabaseClient<Database>,
  entry: {
    actorId: string;
    action: string;
    subjectType: "user" | "restaurant" | "payment";
    subjectId: string | null;
    subjectLabel: string | null;
    detail?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc("log_admin_action", {
      _actor: entry.actorId,
      _action: entry.action,
      _subject_type: entry.subjectType,
      _subject_id: entry.subjectId,
      _subject_label: entry.subjectLabel,
      _detail: entry.detail ?? null,
    });
    if (error) {
      console.error("[audit] could not record admin action", entry.action, error.message);
    }
  } catch (err) {
    console.error("[audit] could not record admin action", entry.action, err);
  }
}
