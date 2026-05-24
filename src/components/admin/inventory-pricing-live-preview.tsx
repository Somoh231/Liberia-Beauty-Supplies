"use client";

import { useMemo } from "react";
import { formatSalonMoney, type SalonCurrency } from "@/lib/admin/salon-format";
import {
  convertLrdCentsToUsdCents,
  convertUsdCentsToLrdCents,
  effectiveUnitCostUsdCents,
  formatOperationalFxSummaryLine,
  inventoryCostingFromFormMajors,
  isInvalidManualNgnPerUsdField,
  supplierUnitCostToUsdCentsExclLanded,
  unitGrossMarginPct,
  unitGrossProfitUsdCents,
} from "@/lib/admin/pricing-engine";
import { cn } from "@/lib/utils";

function marginTonePct(m: number | null): "high" | "ok" | "low" | "bad" | "none" {
  if (m == null || !Number.isFinite(m)) return "none";
  if (m < 0) return "bad";
  if (m < 12) return "low";
  if (m >= 35) return "high";
  return "ok";
}

const marginBadgeCls: Record<ReturnType<typeof marginTonePct>, string> = {
  high: "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-100/90",
  ok: "border-white/15 bg-white/[0.05] text-white/75",
  low: "border-amber-500/30 bg-amber-500/[0.07] text-amber-100/85",
  bad: "border-red-500/35 bg-red-500/[0.08] text-red-100/90",
  none: "border-white/10 bg-black/25 text-white/45",
};

export function InventoryPricingLivePreview({
  avgCostMajorStr,
  costCurrency,
  fxNgnText,
  landedUsdMajorStr,
  sellUsdMajorStr,
  sellLrdMajorStr,
  storeUsdMajorStr,
  postedWacUsdCents,
  quantityMajorStr,
}: {
  avgCostMajorStr: string;
  costCurrency: SalonCurrency;
  fxNgnText: string;
  landedUsdMajorStr: string;
  sellUsdMajorStr: string;
  sellLrdMajorStr: string;
  storeUsdMajorStr: string;
  postedWacUsdCents: number | null;
  /** Qty on hand (edit) or opening qty (new) — inventory value preview */
  quantityMajorStr: string;
}) {
  const fxInvalid = isInvalidManualNgnPerUsdField(fxNgnText);
  const fxSummary = formatOperationalFxSummaryLine();

  const draft = useMemo(() => {
    const avg = Number.parseFloat(avgCostMajorStr) || 0;
    const landed = Number.parseFloat(landedUsdMajorStr) || 0;
    const su = Number.parseFloat(sellUsdMajorStr) || 0;
    const sl = Number.parseFloat(sellLrdMajorStr) || 0;
    const st = Number.parseFloat(storeUsdMajorStr) || 0;
    return inventoryCostingFromFormMajors({
      avgUnitCostMajor: avg,
      costCurrency,
      fxNgnPerUsdText: fxInvalid ? "" : fxNgnText,
      landedUsdMajor: landed,
      sellUsdMajor: su,
      sellLrdMajor: sl,
      storeUsdMajor: st,
      postedWacUsdCents,
    });
  }, [
    avgCostMajorStr,
    costCurrency,
    fxNgnText,
    fxInvalid,
    landedUsdMajorStr,
    sellUsdMajorStr,
    sellLrdMajorStr,
    storeUsdMajorStr,
    postedWacUsdCents,
  ]);

  const supplierUsdExcl = supplierUnitCostToUsdCentsExclLanded(draft);
  const bookLanded = effectiveUnitCostUsdCents(draft, { ignoreWeightedAvg: true });
  const saleBasisLanded = effectiveUnitCostUsdCents(draft);
  const gp = unitGrossProfitUsdCents(draft);
  const margin = unitGrossMarginPct(draft);
  const marginBand = marginTonePct(margin);

  const qty = Number.parseFloat(quantityMajorStr) || 0;
  const valuationPreview = qty > 0 && Number.isFinite(qty) ? Math.round(qty * saleBasisLanded) : null;

  const usdCents = draft.sell_price_usd_cents ?? 0;
  const lrdCents = draft.sell_price_lrd_cents ?? 0;
  const usdEquivLrd = usdCents > 0 ? convertUsdCentsToLrdCents(usdCents) : null;
  const lrdEquivUsd = lrdCents > 0 ? convertLrdCentsToUsdCents(lrdCents) : null;

  const fxSourceRow =
    costCurrency === "NGN" ? (
      <p className="text-[11px] text-white/45">
        {fxNgnText.trim() !== "" && !fxInvalid ? (
          <>Row FX: ₦{Number(fxNgnText).toLocaleString()}/USD · central fallback: {fxSummary}</>
        ) : (
          <>Central rate: {fxSummary}</>
        )}
      </p>
    ) : (
      <p className="text-[11px] text-white/45">LD cross: {fxSummary}</p>
    );

  return (
    <div className="rounded-xl border border-[var(--admin-accent)]/20 bg-black/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Live preview</p>
          <p className="mt-1 text-[11px] text-white/35">Instant economics — no save needed</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1",
            marginBadgeCls[marginBand],
          )}
        >
          {margin == null
            ? "Margin —"
            : margin < 0
              ? "Below cost"
              : margin < 12
                ? "Low margin"
                : margin >= 35
                  ? "Strong margin"
                  : "OK margin"}
        </span>
      </div>

      {fxInvalid ? (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/[0.08] px-2 py-1.5 text-[11px] text-red-100/90">
          FX must be blank or a number greater than zero.
        </p>
      ) : null}

      {fxSourceRow}

      {costCurrency === "NGN" && (Number.parseFloat(avgCostMajorStr) || 0) > 0 ? (
        <p className="mt-2 text-sm text-white/85">
          Supplier (ex-landed) ≈ <span className="text-[var(--admin-accent)]">{formatSalonMoney(supplierUsdExcl, "USD")}</span> USD
        </p>
      ) : costCurrency === "USD" && (Number.parseFloat(avgCostMajorStr) || 0) > 0 ? (
        <p className="mt-2 text-sm text-white/85">
          Supplier ≈ <span className="text-[var(--admin-accent)]">{formatSalonMoney(Math.round((Number.parseFloat(avgCostMajorStr) || 0) * 100), "USD")}</span>{" "}
          USD
        </p>
      ) : costCurrency === "LRD" && (Number.parseFloat(avgCostMajorStr) || 0) > 0 ? (
        <p className="mt-2 text-sm text-white/85">
          Supplier ≈ <span className="text-[var(--admin-accent)]">{formatSalonMoney(supplierUsdExcl, "USD")}</span> USD (at LD/USD)
        </p>
      ) : null}

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Book landed (USD / unit)</dt>
          <dd className="text-white">{formatSalonMoney(bookLanded, "USD")}</dd>
        </div>
        {postedWacUsdCents != null && postedWacUsdCents > 0 ? (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Posted WAC (sale basis)</dt>
            <dd className="text-[var(--admin-accent)]">{formatSalonMoney(postedWacUsdCents, "USD")}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Cost for margin</dt>
          <dd className="text-white">{formatSalonMoney(saleBasisLanded, "USD")}</dd>
        </div>
        {valuationPreview != null ? (
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Stock value preview (qty × cost for margin)</dt>
            <dd className="text-white">{formatSalonMoney(valuationPreview, "USD")}</dd>
          </div>
        ) : null}
        {usdCents > 0 && usdEquivLrd != null ? (
          <div className="sm:col-span-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <p className="text-white/85">{formatSalonMoney(usdCents, "USD")} retail</p>
            <p className="text-[11px] text-white/45">≈ {formatSalonMoney(usdEquivLrd, "LRD")}</p>
          </div>
        ) : null}
        {lrdCents > 0 && lrdEquivUsd != null ? (
          <div className="sm:col-span-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <p className="text-white/85">{formatSalonMoney(lrdCents, "LRD")} retail</p>
            <p className="text-[11px] text-white/45">≈ {formatSalonMoney(lrdEquivUsd, "USD")}</p>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Gross profit / unit (USD)</dt>
          <dd className={cn(gp != null && gp < 0 && "text-red-200")}>{gp != null ? formatSalonMoney(gp, "USD") : "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Margin (retail USD)</dt>
          <dd className="text-[var(--admin-accent)]">{margin != null ? `${margin.toFixed(1)}%` : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
