"use client";

import {
  OPERATIONAL_RESET_CONFIRM_PHRASE,
  previewOperationalResetAction,
  resetSalesAndInventoryAction,
  type OperationalResetPreview,
} from "@/app/actions/admin-operational-reset";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

function errMsg(code: string): string {
  const map: Record<string, string> = {
    confirmation_mismatch: `Type exactly "${OPERATIONAL_RESET_CONFIRM_PHRASE}" to confirm.`,
    reason_required: "A short reason is required (at least 3 characters).",
    backup_confirmation_required: "Confirm that a database backup / export has been taken.",
    forbidden_owner_required: "Only the business owner can run this reset.",
    migration_required:
      "Database migration required. Apply 20260525120000_operational_clean_restart.sql on Supabase.",
    preview_failed: "Could not load reset preview counts.",
    reset_failed: "Reset failed and was rolled back.",
  };
  return map[code] ?? code.replace(/_/g, " ");
}

/**
 * Owner-only destructive reset UI. Does not auto-run.
 * Requires preview → backup checkbox → typed confirmation → reason.
 */
export function OperationalDatasetResetPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);
  const [preview, setPreview] = useState<OperationalResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [backupReference, setBackupReference] = useState("");

  const canExecute =
    !!preview &&
    backupConfirmed &&
    confirmation === OPERATIONAL_RESET_CONFIRM_PHRASE &&
    reason.trim().length >= 3 &&
    !pending;

  return (
    <section className="admin-card space-y-4 border border-red-500/35 p-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300/80">Danger zone</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl text-white">
          Reset sales &amp; inventory dataset
        </h2>
        <p className="mt-2 text-sm text-white/55">
          Deletes retail sales, inventory items, movements, purchase lines tied to inventory, and import batches. Preserves
          users, RBAC, suppliers, service revenue, space leases, operational settings, and reconciliation history (marked
          as prior dataset so it does not contaminate new totals). Atomic — rolls back on failure.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-white/45">
          <li>Export / backup Supabase (sales, inventory_*, purchases*, movements).</li>
          <li>Load dry-run preview counts below.</li>
          <li>Confirm backup, type the phrase, give a reason, then execute.</li>
          <li>Import catalog-only workbook after reset.</li>
        </ol>
      </div>

      {okId ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
          Reset complete. Audit id: <span className="font-mono text-xs">{okId}</span>. You can now seed the catalog
          workbook.
        </p>
      ) : null}

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      <button
        type="button"
        disabled={pending}
        className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm text-white/85 disabled:opacity-40"
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await previewOperationalResetAction();
            if (!r.ok) {
              setErr(errMsg(r.error));
              return;
            }
            setPreview(r.preview ?? null);
          });
        }}
      >
        {pending && !preview ? "Loading preview…" : "Load dry-run preview counts"}
      </button>

      {preview ? (
        <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/70">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Would delete / clear</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            <li>Sales: {preview.sales}</li>
            <li>Sale edit logs: {preview.sales_edit_log}</li>
            <li>Inventory items: {preview.inventory_items}</li>
            <li>Movements: {preview.inventory_movements}</li>
            <li>Correction logs: {preview.inventory_correction_log}</li>
            <li>Import batches: {preview.inventory_import_batches}</li>
            <li>Purchases: {preview.purchases}</li>
            <li>Purchase lines: {preview.purchase_lines}</li>
            <li>Weekly product sales: {preview.weekly_product_sales}</li>
            <li>Service usage arrays cleared: {preview.service_logs_with_product_usage}</li>
            <li>Reconciliations superseded (kept): {preview.reconciliations_live}</li>
          </ul>
          <p className="mt-3 text-white/45">
            FX retained: ₦{preview.fx?.ngn_per_usd}/USD · LD {preview.fx?.lrd_per_usd}/USD
          </p>
        </div>
      ) : null}

      <label className="flex items-start gap-3 text-sm text-white/70">
        <input
          type="checkbox"
          className="mt-1"
          checked={backupConfirmed}
          onChange={(e) => setBackupConfirmed(e.target.checked)}
        />
        <span>I confirm a database backup / export has been taken before this reset.</span>
      </label>

      <label className="block text-xs text-white/55">
        Backup reference (optional)
        <input
          className={field}
          value={backupReference}
          onChange={(e) => setBackupReference(e.target.value)}
          placeholder="e.g. supabase dump 2026-07-11 / ticket #"
        />
      </label>

      <label className="block text-xs text-white/55">
        Reason (required)
        <input
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Clean restart before catalog seed from master workbook"
          required
          minLength={3}
        />
      </label>

      <label className="block text-xs text-white/55">
        Type <span className="font-mono text-white/80">{OPERATIONAL_RESET_CONFIRM_PHRASE}</span> to confirm
        <input
          className={field}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={OPERATIONAL_RESET_CONFIRM_PHRASE}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <button
        type="button"
        disabled={!canExecute}
        className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          setErr(null);
          setOkId(null);
          start(async () => {
            const r = await resetSalesAndInventoryAction({
              confirmation,
              reason,
              backupConfirmed,
              backupReference: backupReference || null,
            });
            if (!r.ok) {
              setErr(errMsg(r.error));
              return;
            }
            setOkId(r.resetId ?? "ok");
            setConfirmation("");
            setPreview(null);
            router.refresh();
          });
        }}
      >
        {pending ? "Resetting…" : "Execute sales & inventory reset"}
      </button>
    </section>
  );
}
