"use client";

import {
  previewOperationalResetAction,
  reauthForOperationalResetAction,
  resetSalesAndInventoryAction,
} from "@/app/actions/admin-operational-reset";
import {
  OPERATIONAL_RESET_CONFIRM_PHRASE,
  canEnableOperationalReset,
  type OperationalResetPreview,
  type OperationalResetResult,
  type OperationalResetWipeCounts,
} from "@/lib/admin/operational-reset";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

function errMsg(code: string): string {
  const map: Record<string, string> = {
    confirmation_mismatch: `Type exactly "${OPERATIONAL_RESET_CONFIRM_PHRASE}" to confirm.`,
    backup_confirmation_required: "Confirm that a database backup / export has been taken.",
    forbidden_owner_required: "Only the business owner can run this reset.",
    migration_required:
      "Database migration required. Apply 20260530120000_operational_hard_reset_full_fk_audit.sql on Supabase.",
    preview_failed: "Could not load reset preview counts.",
    reauth_required: "Re-enter your password to authorize this reset.",
    reauth_failed: "Password verification failed.",
    reauth_expired: "Password confirmation expired. Re-authenticate and try again.",
    preserved_data_changed: "Preserved data changed during reset (rolled back).",
    reset_incomplete: "Wipe incomplete — some operational rows remained (rolled back).",
    reset_failed: "Reset failed and was rolled back.",
  };
  if (map[code]) return map[code];
  if (code.startsWith("preserved_data_changed")) {
    return `Preserved data changed during reset (rolled back). ${code.replace(/^preserved_data_changed:?\s*/i, "")}`;
  }
  if (code.startsWith("reset_incomplete")) {
    return `Wipe incomplete (rolled back). Remaining: ${code.replace(/^reset_incomplete:?\s*/i, "")}`;
  }
  if (code.startsWith("foreign_key_violation")) {
    return `Foreign key blocked delete (rolled back): ${code}`;
  }
  if (code.startsWith("reset_failed:")) {
    return `Reset failed and was rolled back. ${code.slice("reset_failed:".length).trim()}`;
  }
  return code.replace(/_/g, " ");
}

function WipeCountsList({ title, counts }: { title: string; counts: OperationalResetWipeCounts }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/70">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        <li>Sale edit logs: {counts.sales_edit_log}</li>
        <li>Inventory movements: {counts.inventory_movements}</li>
        <li>Stock movements: {counts.stock_movements ?? 0}</li>
        <li>Correction logs: {counts.inventory_correction_log}</li>
        <li>Sale items: {counts.sale_items ?? 0}</li>
        <li>Sales: {counts.sales}</li>
        <li>Purchase lines: {counts.purchase_lines}</li>
        <li>Purchase items: {counts.purchase_items ?? 0}</li>
        <li>Purchase invoices: {counts.purchase_invoices ?? 0}</li>
        <li>Purchases: {counts.purchases}</li>
        <li>Weekly product sales: {counts.weekly_product_sales}</li>
        <li>Weekly log product lines: {counts.weekly_log_product_lines ?? 0}</li>
        <li>Weekly log service lines: {counts.weekly_log_service_lines ?? 0}</li>
        <li>Weekly logs: {counts.weekly_logs ?? 0}</li>
        <li>Import batches: {counts.inventory_import_batches}</li>
        <li>Inventory items: {counts.inventory_items}</li>
        <li>Daily reconciliations: {counts.daily_cash_reconciliations}</li>
        <li>Service usage arrays to clear: {counts.service_logs_with_product_usage}</li>
      </ul>
    </div>
  );
}

/**
 * Owner-only destructive hard reset. Soft catalog-clear is removed.
 * Flow: pre-flight counts → backup checkbox → phrase → password reauth → execute → post counts.
 * No reason / backup_reference fields — nothing is persisted to a reset-history table.
 */
export function OperationalDatasetResetPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<OperationalResetPreview | null>(null);
  const [result, setResult] = useState<OperationalResetResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthChallengeId, setReauthChallengeId] = useState<string | null>(null);
  const [reauthOk, setReauthOk] = useState(false);

  const canExecute = canEnableOperationalReset({
    hasPreview: !!preview,
    backupConfirmed,
    confirmation,
    reauthChallengeId,
    pending,
  });

  return (
    <section className="admin-card space-y-4 border border-red-500/35 p-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300/80">Danger zone · owner only</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl text-white">
          Reset sales &amp; inventory dataset
        </h2>
        <p className="mt-2 text-sm text-white/55">
          Permanently deletes retail sales, inventory, movements, purchases, import batches, and daily cash
          reconciliations in one transaction. Preserves users, RBAC, suppliers, service rows/revenue, space leases, and
          operational settings. Clears service product_usage links only.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-white/45">
          <li>Take a Supabase backup / export externally.</li>
          <li>Load pre-flight wipe counts.</li>
          <li>Confirm backup, type the phrase, re-enter your password.</li>
          <li>Execute — review the post-reset zero report.</li>
        </ol>
      </div>

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      <button
        type="button"
        disabled={pending}
        className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm text-white/85 disabled:opacity-40"
        onClick={() => {
          setErr(null);
          setResult(null);
          start(async () => {
            const r = await previewOperationalResetAction();
            if (!r.ok) {
              setErr(errMsg(r.error));
              return;
            }
            setPreview(r.preview ?? null);
            setReauthChallengeId(null);
            setReauthOk(false);
            setPassword("");
          });
        }}
      >
        {pending && !preview ? "Loading preview…" : "Load pre-flight wipe counts"}
      </button>

      {preview ? (
        <>
          <WipeCountsList title="Pre-flight — will wipe / clear" counts={preview.wipe} />
          <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/55">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Preserved (unchanged)</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              <li>User profiles: {preview.preserved.user_profiles}</li>
              <li>Suppliers: {preview.preserved.suppliers}</li>
              <li>Service logs: {preview.preserved.service_logs}</li>
              <li>Space leases: {preview.preserved.space_lease_payments}</li>
              <li>Operational settings: {preview.preserved.operational_settings}</li>
              <li>Weekly service sales: {preview.preserved.weekly_service_sales}</li>
            </ul>
            <p className="mt-2 text-white/40">
              FX retained: ₦{preview.fx.ngn_per_usd}/USD · LD {preview.fx.lrd_per_usd}/USD
            </p>
          </div>
        </>
      ) : null}

      <label className="flex items-start gap-3 text-sm text-white/70">
        <input
          type="checkbox"
          className="mt-1"
          checked={backupConfirmed}
          onChange={(e) => setBackupConfirmed(e.target.checked)}
        />
        <span>I confirm an external database backup / snapshot was taken manually before this reset.</span>
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

      <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
        <p className="text-xs text-amber-100/85">
          Re-authenticate with your owner password in this session. Required before the destructive button unlocks.
        </p>
        <label className="block text-xs text-white/55">
          Owner password
          <input
            className={field}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setReauthChallengeId(null);
              setReauthOk(false);
            }}
            autoComplete="current-password"
            placeholder="Current password"
          />
        </label>
        <button
          type="button"
          disabled={pending || !password || !preview}
          className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm text-white/85 disabled:opacity-40"
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await reauthForOperationalResetAction({ password });
              if (!r.ok) {
                setErr(errMsg(r.error));
                setReauthOk(false);
                setReauthChallengeId(null);
                return;
              }
              setReauthChallengeId(r.reauthChallengeId ?? null);
              setReauthOk(true);
              setPassword("");
            });
          }}
        >
          {pending ? "Verifying…" : reauthOk ? "Re-authenticated ✓" : "Verify password"}
        </button>
      </div>

      <button
        type="button"
        disabled={!canExecute}
        className="admin-btn-danger rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (!reauthChallengeId) return;
          setErr(null);
          setResult(null);
          start(async () => {
            const r = await resetSalesAndInventoryAction({
              confirmation,
              backupConfirmed,
              reauthChallengeId,
            });
            if (!r.ok) {
              setErr(errMsg(r.error));
              setReauthChallengeId(null);
              setReauthOk(false);
              return;
            }
            setResult(r.result ?? null);
            setConfirmation("");
            setReauthChallengeId(null);
            setReauthOk(false);
            setPreview(null);
            router.refresh();
          });
        }}
      >
        {pending ? "Resetting…" : "Execute sales & inventory reset"}
      </button>

      {result ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
            Reset complete. Correlation id: <span className="font-mono text-xs">{result.reset_id}</span>
          </p>
          <WipeCountsList title="Post-reset wipe counts (must be zero)" counts={result.post} />
        </div>
      ) : null}
    </section>
  );
}
