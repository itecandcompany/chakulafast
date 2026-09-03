import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE } from "@/lib/queries/adminTables";

/**
 * Page controls for the admin tables.
 *
 * The count is the point. These screens previously showed a fixed slice with
 * nothing to say it was a slice, so an admin could search, see nothing, and
 * conclude a restaurant didn't exist. "Showing 26-50 of 413" is what turns
 * that into a question the person can actually act on.
 */
export default function Paginator({
  page,
  total,
  rows,
  onPage,
  busy,
}: {
  page: number;
  total: number;
  /** Rows on the current page — the last page is usually short. */
  rows: number;
  onPage: (next: number) => void;
  busy?: boolean;
}) {
  const first = total === 0 ? 0 : page * ADMIN_PAGE_SIZE + 1;
  const last = page * ADMIN_PAGE_SIZE + rows;
  const hasMore = last < total;

  // One page of results needs no controls, but the total is still worth
  // saying — it is the difference between "3 results" and "3 so far".
  if (total <= ADMIN_PAGE_SIZE && page === 0) {
    return (
      <p className="pt-1 text-xs text-muted-foreground">
        {total} {total === 1 ? "result" : "results"}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page === 0 || busy}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!hasMore || busy}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
