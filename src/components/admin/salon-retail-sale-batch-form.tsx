"use client";

import { createRetailSalesBatchAction, type RetailSaleLineInput } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import {
  complementaryRetailLabel,
  convertRetailUnitMajorOnCurrencySwitch,
  effectiveUnitCostUsdCents,
  saleLineFinancialPreview,
  unitGrossMarginPct,
  unitMarginPctAtRetailPriceMinor,
} from "@/lib/admin/pricing-engine";
import { currencyShortLabel, formatSalonMoney, normalizeCurrency, parseMoneyToCents } from "@/lib/admin/salon-format";
import { OperationalFxBanner } from "@/components/admin/operational-fx-banner";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { InventoryProductTypeaheadSelect } from "@/components/admin/inventory-product-typeahead";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

const fieldReadonly =
  "mt-1 w-full min-h-[2.75rem] cursor-not-allowed rounded-xl border border-white/8 bg-black/40 px-3 py-2.5 text-sm text-white/60 sm:min-h-0";

type Row = RetailSaleLineInput & { key: string; allowPriceOverride?: boolean };

function newRow(): Row {
  const today = new Date().toISOString().slice(0, 10);
  return {
    key: crypto.randomUUID(),
    inventoryItemId: "",
    qty: "1",
    unitPrice: "",
    currency: "USD",
    customerName: "",
    notes: "",
    saleDate: today,
    allowPriceOverride: false,
  };
}

function catalogDefaults(item: InventoryItemRow): { currency: "USD" | "LRD"; unitPriceMajor: string } {
  if (item.sell_price_usd_cents != null && item.sell_price_usd_cents > 0) {
    return { currency: "USD", unitPriceMajor: (item.sell_price_usd_cents / 100).toFixed(2) };
  }
  if (item.sell_price_lrd_cents != null && item.sell_price_lrd_cents > 0) {
    return { currency: "LRD", unitPriceMajor: (item.sell_price_lrd_cents / 100).toFixed(2) };
  }
  return { currency: "USD", unitPriceMajor: "" };
}

function formatEquivMinor(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RETAIL_DRAFT_KEY = "salon_draft_retail_batch_v1";

export function SalonRetailSaleBatchForm({
  items,
  staff,
  operationalFxSummaryLine,
  operationalFx,
}: {
  items: InventoryItemRow[];
  staff: boolean;
  operationalFxSummaryLine?: string;
  /** Settings-driven rates for LRD↔USD conversion / margin preview. */
  operationalFx?: { ngnPerUsd: number; lrdPerUsd: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, newRow));
  const submitLockRef = useRef(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(RETAIL_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { saleDate?: string; rows?: Row[] };
      if (!parsed?.rows?.length) return;
      if (window.confirm("Restore unsaved sale draft from this device?")) {
        const legacyDefault =
          parsed.saleDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.saleDate) ? parsed.saleDate : null;
        if (legacyDefault) setSaleDate(legacyDefault);
        setRows(
          parsed.rows.map((r) => ({
            ...newRow(),
            ...r,
            key: r.key && typeof r.key === "string" ? r.key : crypto.randomUUID(),
            saleDate:
              r.saleDate && /^\d{4}-\d{2}-\d{2}$/.test(r.saleDate)
                ? r.saleDate
                : legacyDefault ?? new Date().toISOString().slice(0, 10),
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const draftDirty = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.inventoryItemId && r.inventoryItemId.length > 0) ||
          (r.unitPrice && r.unitPrice.trim() !== "") ||
          (r.customerName && r.customerName.trim() !== "") ||
          (r.notes && r.notes.trim() !== "") ||
          r.allowPriceOverride === true ||
          (r.qty !== "" && r.qty !== "1"),
      ),
    [rows],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!draftDirty) {
        localStorage.removeItem(RETAIL_DRAFT_KEY);
        return;
      }
      localStorage.setItem(RETAIL_DRAFT_KEY, JSON.stringify({ saleDate, rows }));
    }, 600);
    return () => window.clearTimeout(t);
  }, [rows, saleDate, draftDirty]);

  useEffect(() => {
    if (!draftDirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [draftDirty]);

  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  const priceLocked = (row: Row, item: InventoryItemRow | undefined) => staff || (!!item && !row.allowPriceOverride);

  const batchTotals = useMemo(() => {
    let revenueUsdCents = 0;
    let grossProfitUsdCents = 0;
    let lines = 0;
    for (const row of rows) {
      const sel = itemById[row.inventoryItemId];
      if (!sel) continue;
      const uc = parseMoneyToCents(row.unitPrice);
      const qtyN = Number(String(row.qty).replace(/,/g, ""));
      if (uc == null || !Number.isFinite(qtyN) || qtyN <= 0) continue;
      const lineCurrency: "USD" | "LRD" = row.currency === "LRD" ? "LRD" : "USD";
      const wac = effectiveUnitCostUsdCents(sel, { operationalFx });
      const p = saleLineFinancialPreview({
        qty: qtyN,
        unitPriceCents: uc,
        currency: lineCurrency,
        wacUsdCentsPerUnit: wac,
        fx: operationalFx,
      });
      revenueUsdCents += p.revenueUsdCents;
      grossProfitUsdCents += p.grossProfitUsdCents;
      lines += 1;
    }
    const marginPct = revenueUsdCents > 0 ? (grossProfitUsdCents / revenueUsdCents) * 100 : null;
    return { revenueUsdCents, grossProfitUsdCents, marginPct, lines };
  }, [rows, itemById, operationalFx]);

  return (
    <form
      className="admin-card space-y-5 p-5 pb-28 sm:p-6 sm:pb-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (submitLockRef.current || pending) return;
        if (!staff) {
          let loss = false;
          for (const row of rows) {
            const sel = itemById[row.inventoryItemId];
            if (!sel) continue;
            const uc = parseMoneyToCents(row.unitPrice);
            const qtyN = Number(String(row.qty).replace(/,/g, ""));
            if (uc == null || !Number.isFinite(qtyN) || qtyN <= 0) continue;
            const lineCurrency: "USD" | "LRD" = row.currency === "LRD" ? "LRD" : "USD";
            const prev = saleLineFinancialPreview({
              qty: qtyN,
              unitPriceCents: uc,
              currency: lineCurrency,
              wacUsdCentsPerUnit: effectiveUnitCostUsdCents(sel, { operationalFx }),
              fx: operationalFx,
            });
            if (prev.grossProfitUsdCents < 0) {
              loss = true;
              break;
            }
          }
          if (loss && !window.confirm("One or more lines have negative gross profit at this price. Save anyway?")) return;
        }
        submitLockRef.current = true;
        start(async () => {
          try {
            const lines: RetailSaleLineInput[] = rows
              .filter((r) => r.inventoryItemId && r.qty && r.unitPrice)
              .map((r) => ({
                inventoryItemId: r.inventoryItemId,
                qty: r.qty,
                unitPrice: r.unitPrice,
                currency: normalizeCurrency(r.currency),
                customerName: r.customerName || null,
                notes: r.notes || null,
                saleDate: r.saleDate?.trim() || saleDate,
              }));
            const r = await createRetailSalesBatchAction({ saleDate, lines });
            if (!r.ok) {
              setErr(r.error.replace(/_/g, " "));
              return;
            }
            localStorage.removeItem(RETAIL_DRAFT_KEY);
            setRows(Array.from({ length: 5 }, newRow));
            router.refresh();
          } finally {
            submitLockRef.current = false;
          }
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <OperationalFxBanner className="mb-1" summaryLine={operationalFxSummaryLine} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Default date (fallback)
          <input type="date" className={field} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
        </label>
        <p className="self-end text-xs text-white/40">
          Catalog retail and landed cost fill in automatically.
          {staff ? " Prices match inventory; managers change retail in Inventory." : null}
        </p>
      </div>

      <div className="space-y-4">
        {rows.map((row, idx) => {
          const sel = itemById[row.inventoryItemId];
          const wac = sel ? effectiveUnitCostUsdCents(sel, { operationalFx }) : 0;
          const uc = parseMoneyToCents(row.unitPrice);
          const qtyN = Number(String(row.qty).replace(/,/g, ""));
          const lineCurrency: "USD" | "LRD" = row.currency === "LRD" ? "LRD" : "USD";
          const preview =
            sel && uc != null && Number.isFinite(qtyN) && qtyN > 0
              ? saleLineFinancialPreview({
                  qty: qtyN,
                  unitPriceCents: uc,
                  currency: lineCurrency,
                  wacUsdCentsPerUnit: wac,
                  fx: operationalFx,
                })
              : null;
          const dual = row.unitPrice ? complementaryRetailLabel(row.unitPrice, lineCurrency, operationalFx) : null;
          const unitMargin = sel ? unitGrossMarginPct(sel, { operationalFx }) : null;
          const liveUnitMargin =
            sel && uc != null && uc > 0
              ? unitMarginPctAtRetailPriceMinor(uc, lineCurrency, wac, operationalFx?.lrdPerUsd)
              : null;
          const locked = priceLocked(row, sel);

          return (
            <div key={row.key} className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 lg:col-span-2">
                  Product
                  <InventoryProductTypeaheadSelect
                    items={items}
                    value={row.inventoryItemId}
                    placeholder="—"
                    inputClassName={field}
                    onValueChange={(v) => {
                      const it = itemById[v];
                      const cat = it ? catalogDefaults(it) : { currency: "USD" as const, unitPriceMajor: "" };
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = {
                          ...next[idx],
                          inventoryItemId: v,
                          currency: cat.currency,
                          unitPrice: cat.unitPriceMajor,
                          allowPriceOverride: false,
                        };
                        return next;
                      });
                    }}
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 lg:col-span-2">
                  Date
                  <input
                    type="date"
                    className={field}
                    value={row.saleDate ?? saleDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = { ...next[idx], saleDate: v };
                        return next;
                      });
                    }}
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  Qty
                  <input
                    className={field}
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = Number(String(raw).replace(/,/g, ""));
                      if (raw === "" || raw === "." || (Number.isFinite(n) && n >= 0)) {
                        setRows((rs) => {
                          const next = [...rs];
                          next[idx] = { ...next[idx], qty: raw };
                          return next;
                        });
                      }
                    }}
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  Unit price
                  <input
                    className={locked ? fieldReadonly : field}
                    readOnly={locked}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={row.unitPrice}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = { ...next[idx], unitPrice: v };
                        return next;
                      });
                    }}
                  />
                  {dual ? (
                    <p className="mt-0.5 text-[11px] text-[var(--admin-accent)]/90">
                      ≈ {currencyShortLabel(dual.equivalentCurrency)} {formatEquivMinor(dual.equivalentCents)}
                    </p>
                  ) : null}
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  Currency
                  <select
                    className={field}
                    value={row.currency}
                    onChange={(e) => {
                      const raw = normalizeCurrency(e.target.value);
                      if (raw !== "USD" && raw !== "LRD") return;
                      const cur: "USD" | "LRD" = row.currency === "LRD" ? "LRD" : "USD";
                      const to: "USD" | "LRD" = raw === "LRD" ? "LRD" : "USD";
                      const converted = convertRetailUnitMajorOnCurrencySwitch(row.unitPrice, cur, to, operationalFx);
                      setRows((rs) => {
                        const n = [...rs];
                        n[idx] = { ...n[idx], currency: to, unitPrice: converted };
                        return n;
                      });
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="LRD">{currencyShortLabel("LRD")}</option>
                  </select>
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  Customer
                  <input
                    className={field}
                    placeholder="Optional"
                    value={row.customerName ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = { ...next[idx], customerName: v };
                        return next;
                      });
                    }}
                  />
                </label>
              </div>

              {!staff && sel ? (
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-white/55">
                  <input
                    type="checkbox"
                    checked={row.allowPriceOverride ?? false}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setRows((rs) => {
                        const next = [...rs];
                        const it = itemById[next[idx].inventoryItemId];
                        const cat = it ? catalogDefaults(it) : { unitPriceMajor: "" };
                        next[idx] = {
                          ...next[idx],
                          allowPriceOverride: on,
                          unitPrice: on ? next[idx].unitPrice : cat.unitPriceMajor,
                        };
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-white/25"
                  />
                  Override catalog retail (manager pricing)
                </label>
              ) : null}

              {sel ? (
                <div className="grid gap-2 border-t border-white/[0.06] pt-2 text-[11px] text-white/55 sm:grid-cols-2 lg:grid-cols-5">
                  <p>
                    <span className="text-white/35">Landed (WAC) $ · </span>
                    <span className="text-white/85">{(wac / 100).toFixed(2)}</span>
                  </p>
                  <p>
                    <span className="text-white/35">Retail $ · </span>
                    <span className="text-white/85">
                      {sel.sell_price_usd_cents != null ? (sel.sell_price_usd_cents / 100).toFixed(2) : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-white/35">Retail LD · </span>
                    <span className="text-white/85">
                      {sel.sell_price_lrd_cents != null ? (sel.sell_price_lrd_cents / 100).toFixed(2) : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-white/35">Line margin (this price) · </span>
                    <span className={liveUnitMargin != null && liveUnitMargin < 0 ? "text-red-200" : "text-[var(--admin-accent)]"}>
                      {liveUnitMargin != null ? `${liveUnitMargin.toFixed(1)}%` : "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-white/35">Catalog margin · </span>
                    <span className="text-white/75">{unitMargin != null ? `${unitMargin.toFixed(1)}%` : "—"}</span>
                  </p>
                </div>
              ) : null}

              {preview ? (
                <div
                  className={`flex flex-wrap gap-x-4 gap-y-1 rounded-lg border px-3 py-2.5 text-[11px] text-white/80 ${
                    preview.grossProfitUsdCents < 0
                      ? "border-red-500/30 bg-red-500/[0.07]"
                      : "border-[var(--admin-accent)]/20 bg-[var(--admin-accent)]/[0.06]"
                  }`}
                >
                  <span>
                    Line total ({lineCurrency}):{" "}
                    <strong className="text-white">{(preview.totalNativeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                  </span>
                  <span>
                    Revenue (USD eq.): <strong className="text-white">{formatSalonMoney(preview.revenueUsdCents, "USD")}</strong>
                  </span>
                  <span>
                    Gross profit:{" "}
                    <strong className={preview.grossProfitUsdCents < 0 ? "text-red-200" : "text-[var(--admin-accent)]"}>
                      {formatSalonMoney(preview.grossProfitUsdCents, "USD")}
                    </strong>
                  </span>
                  <span>
                    Margin:{" "}
                    <strong className="text-white">{preview.marginPct != null ? `${preview.marginPct.toFixed(1)}%` : "—"}</strong>
                  </span>
                </div>
              ) : null}

              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                Notes
                <input
                  className={field}
                  placeholder="Optional"
                  value={row.notes ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => {
                      const next = [...rs];
                      next[idx] = { ...next[idx], notes: v };
                      return next;
                    });
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="admin-form-sticky flex flex-col gap-3 sm:static sm:mt-0 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {batchTotals.lines > 0 ? (
          <div className="mb-1 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-[11px] text-white/75 sm:mb-0 sm:mr-auto sm:w-auto">
            <span className="text-white/45">Batch ({batchTotals.lines} lines):</span>{" "}
            <span className="ml-1 text-white">Rev {formatSalonMoney(batchTotals.revenueUsdCents, "USD")}</span>
            <span className="mx-2 text-white/25">·</span>
            <span className="text-[var(--admin-accent)]">GP {formatSalonMoney(batchTotals.grossProfitUsdCents, "USD")}</span>
            {batchTotals.marginPct != null ? (
              <>
                <span className="mx-2 text-white/25">·</span>
                <span>{batchTotals.marginPct.toFixed(1)}% blend</span>
              </>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="min-h-[2.75rem] rounded-full border border-white/15 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70"
          onClick={() => setRows((r) => [...r, newRow()])}
        >
          Add another line
        </button>
        <button
          type="submit"
          disabled={pending || !items.length}
          className="admin-btn-primary min-h-[2.75rem] rounded-full px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save sales"}
        </button>
      </div>
    </form>
  );
}
