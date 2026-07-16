import Link from "next/link";

/**
 * Prev / next pager for the server-rendered list pages (Cases, Birthdays).
 *
 * The page number lives in the URL (?page=N) so paging is a plain navigation:
 * each page is a fresh server render that fetches only its slice, never the
 * whole table. This is what replaced the old .limit(200) that silently dropped
 * older rows.
 */
export function Pagination({
  basePath,
  page,
  lastPage,
  total,
  shown,
  offset,
  label = "rows",
}: {
  /** Path the page links point at, without the query string. */
  basePath: string;
  page: number;
  lastPage: number;
  /** Total rows across every page, for the "showing X of Y" line. */
  total: number;
  /** How many rows are on the current page. */
  shown: number;
  /** Zero-based index of the first row on this page. */
  offset: number;
  /** Plural noun for the count line, e.g. "cases". */
  label?: string;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + shown;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-zinc-500">
        Showing {from}-{to} of {total.toLocaleString()} {label}
      </span>
      {lastPage > 1 && (
        <div className="flex items-center gap-3">
          {page > 1 ? (
            <Link href={`${basePath}?page=${page - 1}`} className="btn-ghost">
              Previous
            </Link>
          ) : (
            <span className="btn-ghost opacity-40">Previous</span>
          )}
          <span className="text-zinc-500">
            Page {page} of {lastPage}
          </span>
          {page < lastPage ? (
            <Link href={`${basePath}?page=${page + 1}`} className="btn-ghost">
              Next
            </Link>
          ) : (
            <span className="btn-ghost opacity-40">Next</span>
          )}
        </div>
      )}
    </div>
  );
}
