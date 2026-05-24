"use client";

import { commitInventoryImportAction } from "@/app/actions/inventory-import-commit";
import { parseInventoryWorkbookPreviewAction } from "@/app/actions/inventory-import-preview";
import {
  applyInventoryImportOverride,
  type InventoryImportRowOverride,
} from "@/lib/admin/inventory-import/row-overrides";
import type {
  InventoryImportPreviewReport,
  InventoryImportValidationStatus,
  ParsedInventoryImportRow,
} from "@/lib/admin/inventory-import/types";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import {
  DEFAULT_OPERATIONAL_LRD_PER_USD,
  DEFAULT_OPERATIONAL_NGN_PER_USD,
} from "@/lib/admin/pricing-engine";
import { cn } from "@/lib/utils";
import { useMemo, useState, useTransition } from "react";

const STATUS_LABEL: Record<InventoryImportValidationStatus, string> = {
  ok: "OK",
  warning: "Warning",
  error: "Error",
  needs_review: "Needs review",
};

const STATUS_CLS: Record<InventoryImportValidationStatus, string> = {
  ok: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  error: "border-red-500/35 bg-red-500/10 text-red-100",
  needs_review: "border-violet-500/35 bg-violet-500/10 text-violet-100",
};

export function InventoryImportPreviewPanel() {
  const [pending, start] = useTransition();
  const [committing, startCommit] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<InventoryImportPreviewReport | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<InventoryImportValidationStatus | "all">("all");
  const [overrides, setOverrides] = useState<Record<string, InventoryImportRowOverride>>({});
  const [commitResult, setCommitResult] = useState<Awaited<ReturnType<typeof commitInventoryImportAction>> | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fx = useMemo(
    () =>
      report
        ? { ngnPerUsd: report.fxNgnPerUsd, lrdPerUsd: report.fxLrdPerUsd }
        : { ngnPerUsd: DEFAULT_OPERATIONAL_NGN_PER_USD, lrdPerUsd: DEFAULT_OPERATIONAL_LRD_PER_USD },
    [report],
  );

  const displayRows = useMemo(() => {
    if (!report) return [];
    return report.rows
      .map((r) => applyInventoryImportOverride(r, overrides[r.id], fx))
      .filter((r) => {
        if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
        if (statusFilter !== "all" && r.validationStatus !== statusFilter) return false;
        return true;
      });
  }, [report, overrides, categoryFilter, statusFilter, fx]);

  const effectiveSummary = useMemo(() => {
    if (!report) return null;
    const rows = report.rows.map((r) => applyInventoryImportOverride(r, overrides[r.id], fx));
    const importable = rows.filter(
      (r) => !r.skipped && (r.validationStatus === "ok" || r.validationStatus === "warning"),
    ).length;
    const unresolved = rows.filter((r) => r.validationStatus === "needs_review" && !r.skipped).length;
    const userSkipped = rows.filter((r) => r.skipped).length;
    return { importable, unresolved, userSkipped, total: rows.length };
  }, [report, overrides, fx]);

  const canCommit = !!report && (effectiveSummary?.importable ?? 0) > 0 && !committing && !pending;

  return (
    <div className="space-y-6">
      <section className="admin-card space-y-4 p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Upload workbook</h2>
        <p className="text-xs text-white/50">
          Parse and validate every row first. Commit imports validated rows only — unresolved rows stay in the batch for
          later review without blocking migration.
        </p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            setCommitResult(null);
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await parseInventoryWorkbookPreviewAction(fd);
              if (!res.ok) {
                setErr(res.error.replace(/_/g, " "));
                return;
              }
              setReport(res.report);
              setOverrides({});
              setCategoryFilter("all");
              setStatusFilter("all");
            });
          }}
        >
          <label className="block flex-1 text-xs text-white/55">
            Excel workbook (.xlsx)
            <input
              type="file"
              name="workbook"
              accept=".xlsx,.xls"
              required
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--admin-accent)] file:px-3 file:py-1 file:text-[10px] file:font-semibold file:uppercase file:text-black"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-[var(--admin-accent)] px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
          >
            {pending ? "Parsing…" : "Parse & preview"}
          </button>
        </form>
        {err ? <p className="text-sm text-red-300">{err}</p> : null}
      </section>

      {commitResult?.ok ? (
        <section className="admin-card border-emerald-500/30 bg-emerald-500/[0.06] space-y-3 p-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Import complete</h3>
          <ul className="space-y-1 text-sm text-emerald-100/90">
            <li>
              <strong>Imported:</strong> {commitResult.summary.importedCount} rows
            </li>
            <li>
              <strong>Skipped for review:</strong> {commitResult.summary.skippedUnresolvedCount} rows (preserved in
              batch)
            </li>
            {commitResult.summary.userSkippedCount > 0 ? (
              <li>
                <strong>User skipped:</strong> {commitResult.summary.userSkippedCount}
              </li>
            ) : null}
            {commitResult.summary.warningCount > 0 ? (
              <li>
                <strong>Warnings imported:</strong> {commitResult.summary.warningCount}
              </li>
            ) : null}
            <li>
              <strong>Archived prior inventory:</strong> {commitResult.summary.archivedCount} items
            </li>
            <li className="font-mono text-xs text-emerald-200/70">Batch {commitResult.batchId}</li>
          </ul>
          <p className="text-xs text-emerald-100/60">
            Unresolved rows remain in this batch for later import after owner review. Opening quantities created{" "}
            <code className="text-emerald-200/80">opening_balance</code> movements automatically.
          </p>
        </section>
      ) : null}

      {commitResult && !commitResult.ok ? (
        <section className="admin-card border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-200">
          Import failed: {commitResult.error.replace(/_/g, " ")}
        </section>
      ) : null}

      {report ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <SummaryCard label="Total rows" value={report.summary.totalRows} />
            <SummaryCard label="OK" value={report.summary.ok} accent="emerald" />
            <SummaryCard label="Warning" value={report.summary.warning} accent="amber" />
            <SummaryCard label="Needs review" value={report.summary.needsReview} accent="violet" />
            <SummaryCard label="Will import" value={effectiveSummary?.importable ?? 0} accent="gold" />
            <SummaryCard label="Deferred" value={effectiveSummary?.unresolved ?? 0} accent="violet" />
          </section>

          {(report.summary.missingExpectedSheets.length > 0 || report.summary.unknownSheets.length > 0) ? (
            <section className="admin-card border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs text-amber-100/90">
              {report.summary.missingExpectedSheets.length > 0 ? (
                <p>Missing expected sheets: {report.summary.missingExpectedSheets.join(", ")}</p>
              ) : null}
              {report.summary.unknownSheets.length > 0 ? (
                <p className="mt-1">Extra sheets (ignored): {report.summary.unknownSheets.join(", ")}</p>
              ) : null}
            </section>
          ) : null}

          <section className="admin-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">FX (pricing-engine preview)</p>
            <p className="mt-1 text-sm text-white/70">
              ₦{report.fxNgnPerUsd.toLocaleString()}/USD · LD {report.fxLrdPerUsd}/USD
            </p>
          </section>

          <section className="flex flex-wrap gap-2">
            <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")} label="All categories" />
            {report.categorySummaries.map((c) => (
              <FilterChip
                key={c.category}
                active={categoryFilter === c.category}
                onClick={() => setCategoryFilter(c.category)}
                label={`${c.category} (${c.totalRows})`}
              />
            ))}
          </section>

          <section className="flex flex-wrap gap-2">
            {(["all", "ok", "warning", "needs_review", "error"] as const).map((s) => (
              <FilterChip
                key={s}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                label={s === "all" ? "All statuses" : STATUS_LABEL[s]}
              />
            ))}
          </section>

          <section className="admin-card admin-x-scroll overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Row</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Qty / unit</th>
                  <th className="px-2 py-2">Retail ₦</th>
                  <th className="px-2 py-2">USD / LD</th>
                  <th className="px-2 py-2">Messages</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <PreviewRow
                    key={row.id}
                    row={row}
                    override={overrides[row.id]}
                    onOverride={(patch) => setOverrides((o) => ({ ...o, [row.id]: { ...o[row.id], ...patch } }))}
                  />
                ))}
              </tbody>
            </table>
            {displayRows.length === 0 ? <p className="p-4 text-sm text-white/45">No rows match filters.</p> : null}
          </section>

          <section className="admin-card border border-white/10 p-5">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Commit import</h3>
            <p className="mt-2 text-sm text-white/55">
              Will import <strong className="text-white">{effectiveSummary?.importable ?? 0}</strong> validated rows and
              defer <strong className="text-white">{effectiveSummary?.unresolved ?? 0}</strong> unresolved rows for
              later review. Existing live inventory will be archived (not deleted) — sales and movement history preserved.
            </p>
            {!confirmOpen ? (
              <button
                type="button"
                disabled={!canCommit || !!commitResult?.ok}
                onClick={() => {
                  setErr(null);
                  setConfirmOpen(true);
                }}
                className="mt-4 rounded-full bg-[var(--admin-accent)] px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Review & commit import
              </button>
            ) : (
              <div className="mt-4 space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
                <p className="text-sm text-amber-100/90">
                  Confirm: archive all current inventory and import {effectiveSummary?.importable ?? 0} rows?
                  {effectiveSummary?.unresolved ? (
                    <> {effectiveSummary.unresolved} unresolved rows will be saved in batch {report.filename}.</>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!canCommit}
                    onClick={() => {
                      if (!report) return;
                      startCommit(async () => {
                        setErr(null);
                        const res = await commitInventoryImportAction({ report, overrides });
                        setCommitResult(res);
                        setConfirmOpen(false);
                        if (!res.ok) setErr(res.error.replace(/_/g, " "));
                      });
                    }}
                    className="rounded-full bg-[var(--admin-accent)] px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-black disabled:opacity-50"
                  >
                    {committing ? "Importing…" : "Confirm import"}
                  </button>
                  <button
                    type="button"
                    disabled={committing}
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-full border border-white/15 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "violet" | "gold";
}) {
  const border =
    accent === "emerald"
      ? "border-emerald-500/25"
      : accent === "amber"
        ? "border-amber-500/25"
        : accent === "violet"
          ? "border-violet-500/25"
          : accent === "gold"
            ? "border-[var(--admin-accent)]/30"
            : "border-white/10";
  return (
    <div className={cn("admin-card p-4", border)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{value}</p>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ring-1 transition",
        active ? "bg-white/10 text-white ring-white/20" : "text-white/50 ring-transparent hover:bg-white/[0.06]",
      )}
    >
      {label}
    </button>
  );
}

function PreviewRow({
  row,
  override,
  onOverride,
}: {
  row: ParsedInventoryImportRow;
  override?: InventoryImportRowOverride;
  onOverride: (patch: InventoryImportRowOverride) => void;
}) {
  const skipped = override?.skipped || row.skipped;
  return (
    <tr className={cn("border-b border-white/[0.06] align-top", skipped && "opacity-50")}>
      <td className="px-2 py-2">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase",
            STATUS_CLS[row.validationStatus],
          )}
        >
          {STATUS_LABEL[row.validationStatus]}
        </span>
      </td>
      <td className="px-2 py-2 text-white/70">{row.category}</td>
      <td className="px-2 py-2 font-mono text-white/45">{row.sourceRow}</td>
      <td className="px-2 py-2 text-white">
        {row.productName}
        {row.sectionNote ? <span className="mt-0.5 block text-[10px] text-white/40">{row.sectionNote}</span> : null}
        <span className="mt-0.5 block text-[10px] font-mono text-white/30">{row.parserProfile}</span>
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          step="0.01"
          min="0"
          className="w-20 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-white"
          value={override?.quantity ?? row.quantity ?? ""}
          onChange={(e) => onOverride({ quantity: Number(e.target.value) })}
        />
        <span className="ml-1 text-white/45">{row.unit}</span>
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          step="1"
          min="0"
          className="w-24 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-white"
          value={override?.retailNgnMajor ?? row.retailNgnMajor ?? ""}
          onChange={(e) => onOverride({ retailNgnMajor: Number(e.target.value) })}
        />
      </td>
      <td className="px-2 py-2 text-white/60">
        {row.derivedSellUsdCents != null ? formatSalonMoney(row.derivedSellUsdCents, "USD") : "—"}
        <br />
        {row.derivedSellLrdCents != null ? formatSalonMoney(row.derivedSellLrdCents, "LRD") : "—"}
      </td>
      <td className="max-w-xs px-2 py-2 text-[10px] text-white/45">
        <ul className="list-disc pl-3">
          {row.validationMessages.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </td>
      <td className="space-y-1 px-2 py-2">
        <button
          type="button"
          className="block text-[10px] uppercase text-[var(--admin-accent)]"
          onClick={() => onOverride({ skipped: !override?.skipped })}
        >
          {override?.skipped ? "Unskip" : "Skip"}
        </button>
        {row.requiresOwnerConfirmation ? (
          <label className="flex items-center gap-1 text-[10px] text-white/55">
            <input
              type="checkbox"
              checked={!!override?.ownerConfirmed}
              onChange={(e) => onOverride({ ownerConfirmed: e.target.checked })}
            />
            Confirm carton
          </label>
        ) : null}
      </td>
    </tr>
  );
}
