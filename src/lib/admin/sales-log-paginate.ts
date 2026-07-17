/**
 * Server-side pagination for Sales Log filtered totals.
 * Continues until all matching rows are included (no silent 5k cap).
 */

export const SALES_LOG_TOTALS_PAGE_SIZE = 1000;
/** Safety ceiling only — if hit, totals are marked incomplete (never silently truncated). */
export const SALES_LOG_TOTALS_MAX_ROWS = 100_000;

export type PaginatedRowsResult<T> = {
  rows: T[];
  /** True when a safety ceiling stopped collection before the last page. */
  incomplete: boolean;
};

/**
 * Fetch pages via range until a short page or safety ceiling.
 * `fetchPage(from, to)` must return inclusive range rows (PostgREST-style).
 */
export async function paginateUntilExhausted<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  opts?: { pageSize?: number; maxRows?: number },
): Promise<PaginatedRowsResult<T>> {
  const pageSize = opts?.pageSize ?? SALES_LOG_TOTALS_PAGE_SIZE;
  const maxRows = opts?.maxRows ?? SALES_LOG_TOTALS_MAX_ROWS;
  const safePage = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : SALES_LOG_TOTALS_PAGE_SIZE;
  const safeMax = Number.isFinite(maxRows) && maxRows >= 1 ? Math.floor(maxRows) : SALES_LOG_TOTALS_MAX_ROWS;

  const rows: T[] = [];
  let from = 0;

  while (rows.length < safeMax) {
    const to = Math.min(from + safePage - 1, safeMax - 1);
    const page = await fetchPage(from, to);
    if (!page.length) {
      return { rows, incomplete: false };
    }
    rows.push(...page);
    if (page.length < safePage) {
      return { rows, incomplete: false };
    }
    from += safePage;
  }

  const capped = rows.slice(0, safeMax);
  // Probe one more row past the ceiling so exact-at-ceiling datasets stay complete.
  const probe = await fetchPage(safeMax, safeMax);
  return { rows: capped, incomplete: probe.length > 0 };
}
