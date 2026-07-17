/**
 * Stylist fee / rental payment currency math (USD / LRD only for new writes).
 * Stores original amount + transaction-time FX snapshot + USD equivalent.
 *
 * Historical policy:
 * - USD identity backfill is allowed (amount_usd_equiv = amount).
 * - Historical LRD/NGN without a stored snapshot stay null (never invent current FX).
 * - Combined USD totals use only known equivalents; unknown rows are disclosed separately.
 */

export type SpaceLeaseCurrency = "USD" | "LRD";

export type SpaceLeaseCurrencyResolution =
  | {
      ok: true;
      currency: SpaceLeaseCurrency;
      amountCents: number;
      amountUsdEquivCents: number;
      fxLrdPerUsd: number | null;
    }
  | { ok: false; error: string };

export type SpaceLeaseUsdRow = {
  amount_cents: number;
  currency: string;
  amount_usd_equiv_cents?: number | null;
  fx_lrd_per_usd?: number | null;
};

export type SpaceLeaseUsdCoverage = {
  /** Sum of known USD equivalents only (excludes conversion-unavailable rows). */
  usdTotalCents: number;
  rowsTotal: number;
  rowsWithUsd: number;
  rowsConversionUnavailable: number;
  isPartial: boolean;
  coverageLabel: string | null;
};

export function isSpaceLeaseCurrency(value: string): value is SpaceLeaseCurrency {
  return value === "USD" || value === "LRD";
}

/**
 * Resolve stored fields for create/update.
 * - USD: equivalent = original; FX snapshot null
 * - LRD: equivalent = round(original / lrd_per_usd); FX snapshot required (> 0)
 */
export function resolveSpaceLeaseCurrencyFields(input: {
  amountCents: number;
  currency: string;
  lrdPerUsd: number | null | undefined;
}): SpaceLeaseCurrencyResolution {
  if (!Number.isFinite(input.amountCents) || !Number.isInteger(input.amountCents)) {
    return { ok: false, error: "invalid_amount" };
  }
  if (input.amountCents <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  const cur = (input.currency ?? "").trim().toUpperCase();
  if (!cur) return { ok: false, error: "invalid_currency" };
  if (!isSpaceLeaseCurrency(cur)) return { ok: false, error: "unsupported_currency" };

  if (cur === "USD") {
    return {
      ok: true,
      currency: "USD",
      amountCents: input.amountCents,
      amountUsdEquivCents: input.amountCents,
      fxLrdPerUsd: null,
    };
  }

  const fx = input.lrdPerUsd;
  if (fx == null || !Number.isFinite(fx) || fx <= 0) {
    return { ok: false, error: "invalid_fx_rate" };
  }

  return {
    ok: true,
    currency: "LRD",
    amountCents: input.amountCents,
    amountUsdEquivCents: Math.round(input.amountCents / fx),
    fxLrdPerUsd: fx,
  };
}

/**
 * Known USD equivalent for reporting.
 * - Prefer stored amount_usd_equiv_cents
 * - USD with null equiv → amount_cents (identity, not FX invention)
 * - Non-USD without stored equiv → null (conversion unavailable; do not revalue at read time)
 */
export function spaceLeaseUsdEquivCents(row: SpaceLeaseUsdRow): number | null {
  if (row.amount_usd_equiv_cents != null && Number.isFinite(row.amount_usd_equiv_cents)) {
    return Math.round(row.amount_usd_equiv_cents);
  }
  if ((row.currency ?? "").toUpperCase() === "USD") {
    return Math.round(row.amount_cents);
  }
  return null;
}

export function isSpaceLeaseConversionUnavailable(row: SpaceLeaseUsdRow): boolean {
  return spaceLeaseUsdEquivCents(row) == null;
}

export function aggregateSpaceLeaseUsd(rows: SpaceLeaseUsdRow[]): SpaceLeaseUsdCoverage {
  let usdTotalCents = 0;
  let rowsWithUsd = 0;
  for (const row of rows) {
    const usd = spaceLeaseUsdEquivCents(row);
    if (usd == null) continue;
    usdTotalCents += usd;
    rowsWithUsd += 1;
  }
  const rowsTotal = rows.length;
  const rowsConversionUnavailable = rowsTotal - rowsWithUsd;
  const isPartial = rowsConversionUnavailable > 0 && rowsWithUsd > 0;
  const coverageLabel =
    rowsConversionUnavailable > 0
      ? `USD conversion available for ${rowsWithUsd} of ${rowsTotal} rental payments`
      : null;
  return {
    usdTotalCents,
    rowsTotal,
    rowsWithUsd,
    rowsConversionUnavailable,
    isPartial: isPartial || (rowsTotal > 0 && rowsWithUsd === 0 && rowsConversionUnavailable > 0),
    coverageLabel,
  };
}

export function formatSpaceLeaseConversionUnavailable(): string {
  return "Conversion unavailable";
}

export function simulateSpaceLeaseCurrencyEdit(
  existing: {
    id: string;
    amount_cents: number;
    currency: string;
    amount_usd_equiv_cents: number | null;
    fx_lrd_per_usd: number | null;
    created_at: string;
  },
  next: { amountCents: number; currency: string; lrdPerUsd: number },
):
  | {
      ok: true;
      id: string;
      created_at: string;
      amount_cents: number;
      currency: SpaceLeaseCurrency;
      amount_usd_equiv_cents: number;
      fx_lrd_per_usd: number | null;
    }
  | { ok: false; error: string } {
  const resolved = resolveSpaceLeaseCurrencyFields({
    amountCents: next.amountCents,
    currency: next.currency,
    lrdPerUsd: next.lrdPerUsd,
  });
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    id: existing.id,
    created_at: existing.created_at,
    amount_cents: resolved.amountCents,
    currency: resolved.currency,
    amount_usd_equiv_cents: resolved.amountUsdEquivCents,
    fx_lrd_per_usd: resolved.fxLrdPerUsd,
  };
}

/** Pure migration-policy helpers for tests (no DB). */
export function simulateHistoricalSpaceLeaseBackfill(rows: SpaceLeaseUsdRow[]): SpaceLeaseUsdRow[] {
  return rows.map((r) => {
    if ((r.currency ?? "").toUpperCase() === "USD" && r.amount_usd_equiv_cents == null) {
      return { ...r, amount_usd_equiv_cents: r.amount_cents, fx_lrd_per_usd: null };
    }
    // LRD/NGN: leave null — never invent current FX
    return { ...r };
  });
}
