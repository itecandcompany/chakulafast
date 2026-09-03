import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toUserMessage } from "@/lib/errorMessages";
import { qk } from "@/lib/queryClient";
import { ADMIN_PAGE_SIZE } from "@/lib/queries/adminTables";
import Paginator from "@/components/admin/Paginator";

export const Route = createFileRoute("/admin/activity")({ component: AdminActivity });

type AuditRow = {
  id: string;
  actor_name: string | null;
  action: string;
  subject_type: string;
  subject_label: string | null;
  detail: string | null;
  created_at: string;
};

/**
 * Reads the audit log. RLS restricts the table to admins, so a non-admin who
 * reached this URL would simply see an empty list rather than a refusal —
 * which is the same shape every other console screen has.
 */
async function fetchActivity(page: number) {
  const from = page * ADMIN_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("admin_actions")
    .select("id, actor_name, action, subject_type, subject_label, detail, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);

  if (error) throw error;
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}

/**
 * Turns `restaurant.suspended` into a sentence.
 *
 * Falling through to the raw key rather than throwing matters: a new action
 * added to a server function should show up here as an ugly-but-present row,
 * not vanish because nobody remembered to add a label.
 */
const ACTION_LABEL: Record<string, string> = {
  "user.role.admin": "made an administrator",
  "user.role.restaurant": "made a restaurant owner",
  "user.role.customer": "made a customer",
  "user.suspended": "suspended the account",
  "user.restored": "restored the account",
  "restaurant.active": "approved the listing",
  "restaurant.suspended": "suspended the listing",
  "restaurant.rejected": "rejected the listing",
  "restaurant.pending_payment": "put the listing back to awaiting payment",
  "restaurant.deleted": "deleted the listing",
  "payment.confirmed": "confirmed the registration payment",
  "payment.rejected": "rejected the registration payment",
};

const SUBJECT_TONE: Record<string, string> = {
  user: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  restaurant: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  payment: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function AdminActivity() {
  const [page, setPage] = useState(0);

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: qk.adminAudit(page),
    queryFn: () => fetchActivity(page),
    placeholderData: (prev) => prev,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Every administrator action, oldest at the bottom. Entries cannot be edited or removed —
          including by whoever made them.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {toUserMessage(error, "Couldn't load the activity log.")}
        </p>
      )}

      {isPending && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isPending && rows.length === 0 && (
        <div className="grid place-items-center rounded-2xl border border-dashed px-4 py-16 text-center">
          <ScrollText className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nothing here yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Approving a restaurant, confirming a payment or changing someone&apos;s role will all
            leave a record here.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border bg-card p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  SUBJECT_TONE[row.subject_type] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {row.subject_type}
              </span>
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{row.actor_name ?? "A removed administrator"}</span>{" "}
                {ACTION_LABEL[row.action] ?? row.action}
                {row.subject_label && (
                  <>
                    {" — "}
                    <span className="font-medium">{row.subject_label}</span>
                  </>
                )}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </div>
            {row.detail && (
              <p className="mt-1 border-l-2 border-muted pl-2 text-xs text-muted-foreground">
                “{row.detail}”
              </p>
            )}
          </div>
        ))}
      </div>

      {!isPending && (
        <Paginator
          page={page}
          total={total}
          rows={rows.length}
          onPage={setPage}
          busy={isFetching}
        />
      )}
    </div>
  );
}
