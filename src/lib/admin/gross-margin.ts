/**
 * Shared product gross-margin math and profit-status model.
 * Stylist fees and service revenue are intentionally excluded — product COGS only.
 */

export type ProfitStatus =
  | "profitable"
  | "loss"
  | "break_even"
  | "cost_missing"
  | "margin_unavailable";

export type GrossMarginLine = {
  revenueUsdCents: number;
  cogsUsdCents: number | null;
  grossProfitUsdCents: number | null;
  marginPct: number | null;
  status: ProfitStatus;
  costComplete: boolean;
};

export type GrossMarginAggregate = {
  revenueUsdCents: number;
  cogsUsdCents: number;
  grossProfitUsdCents: number | null;
  marginPct: number | null;
  status: ProfitStatus;
  linesTotal: number;
  linesWithCost: number;
  /** True when every line has usable cost; false → do not present margin as complete. */
  costCoverageComplete: boolean;
  /** Partial aggregate is computed only on cost-complete lines when coverage is incomplete. */
  isPartial: boolean;
};

export function profitStatusLabel(status: ProfitStatus): string {
  switch (status) {
    case "profitable":
      return "Profitable";
    case "loss":
      return "Loss";
    case "break_even":
      return "Break-even";
    case "cost_missing":
      return "Cost missing";
    case "margin_unavailable":
      return "Margin unavailable";
  }
}

/**
 * Sale-time unit cost snapshot rules:
 * - null → missing
 * - > 0 → known cost
 * - 0 → treated as missing for legacy false-zero snapshots (never invent 100% margin).
 *   Intentional free goods should still surface Cost missing unless GP is stored with a positive cost.
 */
export function isUsableSaleUnitCostCents(unitCostCents: number | null | undefined): boolean {
  return unitCostCents != null && Number.isFinite(unitCostCents) && unitCostCents > 0;
}

export function computeGrossMarginLine(input: {
  revenueUsdCents: number | null | undefined;
  /** Preferred: stored sale-time gross profit USD cents. */
  grossProfitUsdCents?: number | null;
  /** Sale-time unit cost snapshot (USD cents). */
  unitCostUsdCents?: number | null;
  qty?: number;
}): GrossMarginLine {
  const revenue = input.revenueUsdCents;
  if (revenue == null || !Number.isFinite(revenue) || revenue < 0) {
    return {
      revenueUsdCents: 0,
      cogsUsdCents: null,
      grossProfitUsdCents: null,
      marginPct: null,
      status: "margin_unavailable",
      costComplete: false,
    };
  }

  const qty = input.qty != null && Number.isFinite(input.qty) ? input.qty : 1;
  const unitCost = input.unitCostUsdCents;
  const costComplete = isUsableSaleUnitCostCents(unitCost);

  if (!costComplete) {
    // Stored GP without usable cost is still not trusted for "profitable" labeling.
    return {
      revenueUsdCents: revenue,
      cogsUsdCents: null,
      grossProfitUsdCents: null,
      marginPct: null,
      status: "cost_missing",
      costComplete: false,
    };
  }

  const cogs = Math.round(qty * (unitCost as number));
  const gp =
    input.grossProfitUsdCents != null && Number.isFinite(input.grossProfitUsdCents)
      ? Math.round(input.grossProfitUsdCents)
      : revenue - cogs;

  if (revenue === 0) {
    return {
      revenueUsdCents: 0,
      cogsUsdCents: cogs,
      grossProfitUsdCents: gp,
      marginPct: null,
      status: gp === 0 ? "break_even" : gp > 0 ? "profitable" : "loss",
      costComplete: true,
    };
  }

  const marginPct = (gp / revenue) * 100;
  let status: ProfitStatus;
  if (gp > 0) status = "profitable";
  else if (gp < 0) status = "loss";
  else status = "break_even";

  return {
    revenueUsdCents: revenue,
    cogsUsdCents: cogs,
    grossProfitUsdCents: gp,
    marginPct,
    status,
    costComplete: true,
  };
}

/**
 * Aggregate margin from lines. Policy: when coverage is incomplete, compute
 * margin only on cost-complete lines and mark `isPartial` / incomplete status disclosure.
 * Never averages line-level margin percentages.
 */
export function aggregateGrossMargin(lines: GrossMarginLine[]): GrossMarginAggregate {
  const linesTotal = lines.length;
  const complete = lines.filter((l) => l.costComplete && l.cogsUsdCents != null);
  const linesWithCost = complete.length;
  const costCoverageComplete = linesTotal > 0 && linesWithCost === linesTotal;

  if (linesWithCost === 0) {
    const revenueUsdCents = lines.reduce((n, l) => n + (l.revenueUsdCents || 0), 0);
    return {
      revenueUsdCents,
      cogsUsdCents: 0,
      grossProfitUsdCents: null,
      marginPct: null,
      status: linesTotal === 0 ? "margin_unavailable" : "cost_missing",
      linesTotal,
      linesWithCost: 0,
      costCoverageComplete: false,
      isPartial: false,
    };
  }

  const revenueUsdCents = complete.reduce((n, l) => n + l.revenueUsdCents, 0);
  const cogsUsdCents = complete.reduce((n, l) => n + (l.cogsUsdCents ?? 0), 0);
  const grossProfitUsdCents = revenueUsdCents - cogsUsdCents;

  let marginPct: number | null = null;
  let status: ProfitStatus;
  if (revenueUsdCents === 0) {
    marginPct = null;
    status = grossProfitUsdCents === 0 ? "break_even" : grossProfitUsdCents > 0 ? "profitable" : "loss";
  } else {
    marginPct = (grossProfitUsdCents / revenueUsdCents) * 100;
    if (grossProfitUsdCents > 0) status = "profitable";
    else if (grossProfitUsdCents < 0) status = "loss";
    else status = "break_even";
  }

  const isPartial = !costCoverageComplete;
  return {
    revenueUsdCents,
    cogsUsdCents,
    grossProfitUsdCents,
    marginPct,
    status: isPartial ? status : status,
    linesTotal,
    linesWithCost,
    costCoverageComplete,
    isPartial,
  };
}

export function formatCostCoverage(agg: GrossMarginAggregate): string {
  return `Cost available for ${agg.linesWithCost} of ${agg.linesTotal} product lines`;
}

/** Inventory list/catalog: never treat missing WAC/cost as zero for margin %. */
export function inventoryUnitMarginPct(input: {
  sellPriceUsdCents: number | null | undefined;
  unitCostUsdCents: number | null | undefined;
}): { marginPct: number | null; status: ProfitStatus; grossProfitUsdCents: number | null } {
  const sell = input.sellPriceUsdCents;
  if (sell == null || !Number.isFinite(sell) || sell <= 0) {
    return { marginPct: null, status: "margin_unavailable", grossProfitUsdCents: null };
  }
  if (!isUsableSaleUnitCostCents(input.unitCostUsdCents)) {
    return { marginPct: null, status: "cost_missing", grossProfitUsdCents: null };
  }
  const gp = sell - (input.unitCostUsdCents as number);
  const marginPct = (gp / sell) * 100;
  const status: ProfitStatus = gp > 0 ? "profitable" : gp < 0 ? "loss" : "break_even";
  return { marginPct, status, grossProfitUsdCents: gp };
}
