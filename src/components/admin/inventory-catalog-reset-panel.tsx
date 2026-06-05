"use client";

import { clearActiveInventoryCatalogAction } from "@/app/actions/admin-inventory-catalog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const CONFIRM_PHRASE = "CLEAR INVENTORY";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

function errMsg(code: string): string {
  const map: Record<string, string> = {
    confirmation_mismatch: `Type exactly "${CONFIRM_PHRASE}" to confirm.`,
    reason_required: "A short reason is required (at least 3 characters).",
    forbidden_owner_required: "Only the business owner can clear the active catalog.",
    migration_required:
      "Database migration required. Apply 20260524120000_inventory_catalog_reset.sql on Supabase.",
  };
  return map[code] ?? code.replace(/_/g, " ");
}

export function InventoryCatalogResetPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");

  return (
    <section className="admin-card space-y-4 border border-red-500/25 p-6">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300/80">Danger zone</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl text-white">Clear active inventory catalog</h2>
        <p className="mt-2 text-sm text-white/55">
          This removes current products from the active catalog but preserves historical sales, audit logs, and movements.
          All active SKUs are archived and on-hand quantities are zeroed with ledger entries. Product codes and IDs are
          kept for historical references.
        </p>
      </div>

      {ok ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
          Active catalog cleared. You can add new products or import a workbook.
        </p>
      ) : null}

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      <label className="block text-xs text-white/55">
        Reason / note (required)
        <input
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Replacing catalog with new supplier workbook"
          required
          minLength={3}
        />
      </label>

      <label className="block text-xs text-white/55">
        Type <span className="font-mono text-white/80">{CONFIRM_PHRASE}</span> to confirm
        <input
          className={field}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <button
        type="button"
        disabled={pending || confirmation !== CONFIRM_PHRASE || reason.trim().length < 3}
        className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          setErr(null);
          setOk(false);
          start(async () => {
            const r = await clearActiveInventoryCatalogAction({ confirmation, reason });
            if (!r.ok) {
              setErr(errMsg(r.error));
              return;
            }
            setOk(true);
            setConfirmation("");
            router.refresh();
          });
        }}
      >
        {pending ? "Clearing…" : "Clear active inventory catalog"}
      </button>
    </section>
  );
}
