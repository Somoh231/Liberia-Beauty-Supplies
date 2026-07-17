/**
 * Sales Log URL filters: date range + source.
 * Business timezone: Africa/Monrovia (UTC+0, no DST).
 *
 * Authoritative date fields:
 * - retail sales → sales.sold_at
 * - service logs → service_logs.sold_at
 * - stylist fees → space_lease_payments.week_start_date
 *
 * Boundaries: inclusive calendar start / exclusive next-day upper bound (half-open).
 */

import { getMonroviaDayKey } from "@/lib/admin/salon-format";
import { isValidCalendarDateYmd } from "@/lib/admin/sales-log-edit";

export const SALES_LOG_BUSINESS_TIMEZONE = "Africa/Monrovia" as const;

export const SALES_LOG_RANGE_VALUES = ["today", "7d", "month", "custom", "all"] as const;
export type SalesLogRange = (typeof SALES_LOG_RANGE_VALUES)[number];

export const SALES_LOG_SOURCE_VALUES = ["all", "retail", "services", "stylist-fees"] as const;
export type SalesLogSource = (typeof SALES_LOG_SOURCE_VALUES)[number];

export const DEFAULT_SALES_LOG_RANGE: SalesLogRange = "month";
export const DEFAULT_SALES_LOG_SOURCE: SalesLogSource = "all";

export type SalesLogDateBounds =
  | { kind: "all" }
  | {
      kind: "bounded";
      /** Inclusive YYYY-MM-DD (Monrovia). */
      fromYmd: string;
      /** Inclusive YYYY-MM-DD (Monrovia) as shown in UI. */
      toYmdInclusive: string;
      /** timestamptz ISO for sold_at >= */
      startIsoInclusive: string;
      /** timestamptz ISO for sold_at < (next calendar day) */
      endIsoExclusive: string;
      /** date string for week_start_date >= */
      startDateInclusive: string;
      /** date string for week_start_date < */
      endDateExclusive: string;
    };

export type ParsedSalesLogFilter = {
  range: SalesLogRange;
  source: SalesLogSource;
  from: string | null;
  to: string | null;
  /** True when URL was invalid and we fell back to defaults. */
  usedFallback: boolean;
  bounds: SalesLogDateBounds;
};

export type SalesLogHrefInput = {
  range?: SalesLogRange;
  source?: SalesLogSource;
  from?: string | null;
  to?: string | null;
};

/** Re-export calendar validation for filter consumers. */
export { isValidCalendarDateYmd } from "@/lib/admin/sales-log-edit";

function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  // Monrovia is UTC+0 — calendar arithmetic in UTC matches business days.
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function startOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/**
 * Half-open UTC window for a Monrovia calendar day [day, day+1).
 * Prefer this over end-of-day 23:59:59.999.
 */
export function monroviaDayHalfOpenWindow(dayKey: string): { startIso: string; endIsoExclusive: string } {
  if (!isValidCalendarDateYmd(dayKey)) {
    const today = getMonroviaDayKey();
    return { startIso: `${today}T00:00:00.000Z`, endIsoExclusive: `${addCalendarDaysYmd(today, 1)}T00:00:00.000Z` };
  }
  return {
    startIso: `${dayKey}T00:00:00.000Z`,
    endIsoExclusive: `${addCalendarDaysYmd(dayKey, 1)}T00:00:00.000Z`,
  };
}

export function resolveSalesLogDateBounds(
  range: SalesLogRange,
  from: string | null,
  to: string | null,
  now: Date = new Date(),
): SalesLogDateBounds {
  const today = getMonroviaDayKey(now);

  if (range === "all") return { kind: "all" };

  let fromYmd = today;
  let toYmdInclusive = today;

  if (range === "today") {
    fromYmd = today;
    toYmdInclusive = today;
  } else if (range === "7d") {
    fromYmd = addCalendarDaysYmd(today, -6);
    toYmdInclusive = today;
  } else if (range === "month") {
    fromYmd = startOfMonthYmd(today);
    toYmdInclusive = today;
  } else if (range === "custom") {
    if (!from || !to || !isValidCalendarDateYmd(from) || !isValidCalendarDateYmd(to) || to < from) {
      // Safe fallback: this month
      fromYmd = startOfMonthYmd(today);
      toYmdInclusive = today;
    } else {
      fromYmd = from;
      toYmdInclusive = to;
    }
  }

  const endDateExclusive = addCalendarDaysYmd(toYmdInclusive, 1);
  return {
    kind: "bounded",
    fromYmd,
    toYmdInclusive,
    startIsoInclusive: `${fromYmd}T00:00:00.000Z`,
    endIsoExclusive: `${endDateExclusive}T00:00:00.000Z`,
    startDateInclusive: fromYmd,
    endDateExclusive,
  };
}

/** Shared sold_at predicates for retail + services (same bounds). */
export function salesLogSoldAtPredicates(
  bounds: SalesLogDateBounds,
): { gte: string; lt: string } | null {
  if (bounds.kind !== "bounded") return null;
  return { gte: bounds.startIsoInclusive, lt: bounds.endIsoExclusive };
}

/** Shared week_start_date predicates for stylist fees (same calendar window). */
export function salesLogWeekStartPredicates(
  bounds: SalesLogDateBounds,
): { gte: string; lt: string } | null {
  if (bounds.kind !== "bounded") return null;
  return { gte: bounds.startDateInclusive, lt: bounds.endDateExclusive };
}

function firstString(raw: string | string[] | undefined): string | undefined {
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parseSalesLogSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): ParsedSalesLogFilter {
  let usedFallback = false;

  const rangeRaw = (firstString(searchParams.range) ?? "").trim().toLowerCase();
  let range: SalesLogRange = DEFAULT_SALES_LOG_RANGE;
  if (rangeRaw === "") {
    usedFallback = false; // default is intentional when omitted
    range = DEFAULT_SALES_LOG_RANGE;
  } else if ((SALES_LOG_RANGE_VALUES as readonly string[]).includes(rangeRaw)) {
    range = rangeRaw as SalesLogRange;
  } else {
    usedFallback = true;
    range = DEFAULT_SALES_LOG_RANGE;
  }

  const sourceRaw = (firstString(searchParams.source) ?? "").trim().toLowerCase();
  let source: SalesLogSource = DEFAULT_SALES_LOG_SOURCE;
  if (sourceRaw === "") {
    source = DEFAULT_SALES_LOG_SOURCE;
  } else if ((SALES_LOG_SOURCE_VALUES as readonly string[]).includes(sourceRaw)) {
    source = sourceRaw as SalesLogSource;
  } else {
    usedFallback = true;
    source = DEFAULT_SALES_LOG_SOURCE;
  }

  let from: string | null = null;
  let to: string | null = null;
  if (range === "custom") {
    const fromRaw = (firstString(searchParams.from) ?? "").trim();
    const toRaw = (firstString(searchParams.to) ?? "").trim();
    if (!isValidCalendarDateYmd(fromRaw) || !isValidCalendarDateYmd(toRaw) || toRaw < fromRaw) {
      usedFallback = true;
      range = DEFAULT_SALES_LOG_RANGE;
      from = null;
      to = null;
    } else {
      from = fromRaw;
      to = toRaw;
    }
  }

  const bounds = resolveSalesLogDateBounds(range, from, to, now);
  if (bounds.kind === "bounded" && range === "custom") {
    from = bounds.fromYmd;
    to = bounds.toYmdInclusive;
  } else if (bounds.kind === "bounded" && range !== "custom") {
    // Keep from/to null in parsed filter for non-custom; UI can read bounds for display
    from = null;
    to = null;
  }

  return { range, source, from, to, usedFallback, bounds };
}

/**
 * Canonical internal Sales Log path. Never emits external URLs.
 * Parameter order: range, from, to, source (omit defaults where practical).
 */
export function buildSalesLogHref(input: SalesLogHrefInput = {}): string {
  const range = input.range ?? DEFAULT_SALES_LOG_RANGE;
  const source = input.source ?? DEFAULT_SALES_LOG_SOURCE;

  const params = new URLSearchParams();
  params.set("range", range);

  if (range === "custom") {
    const from = input.from?.trim() ?? "";
    const to = input.to?.trim() ?? "";
    if (isValidCalendarDateYmd(from) && isValidCalendarDateYmd(to) && to >= from) {
      params.set("from", from);
      params.set("to", to);
    } else {
      // Fall back to month rather than emitting bad custom
      params.set("range", DEFAULT_SALES_LOG_RANGE);
    }
  }

  if (source !== "all") {
    params.set("source", source);
  }

  const qs = params.toString();
  return qs ? `/admin/sales-log?${qs}` : "/admin/sales-log";
}

/** Rolling last N Monrovia calendar days inclusive (today counts as day 1). */
export function monroviaLastNDaysInclusive(n: number, now: Date = new Date()): { from: string; to: string } {
  const today = getMonroviaDayKey(now);
  const safeN = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return { from: addCalendarDaysYmd(today, -(safeN - 1)), to: today };
}

export function salesLogRangeLabel(filter: ParsedSalesLogFilter): string {
  const { range, bounds } = filter;
  if (range === "all" || bounds.kind === "all") return "All time";
  if (range === "today") return `Today (${bounds.fromYmd})`;
  if (range === "7d") return `Last 7 days (${bounds.fromYmd} → ${bounds.toYmdInclusive})`;
  if (range === "month") return `This month (${bounds.fromYmd} → ${bounds.toYmdInclusive})`;
  return `Custom (${bounds.fromYmd} → ${bounds.toYmdInclusive})`;
}
