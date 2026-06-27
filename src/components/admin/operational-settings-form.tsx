"use client";

import { saveOperationalSettingsAction } from "@/app/actions/admin-salon";
import type { OperationalSettingsRow } from "@/lib/admin/salon-queries";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

function majorOrEmpty(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "";
  return String(n);
}

export function OperationalSettingsForm({ row }: { row: OperationalSettingsRow | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const lockRef = useRef(false);

  return (
    <form
      className="admin-card max-w-xl space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (lockRef.current) return;
        const fd = new FormData(e.currentTarget);
        lockRef.current = true;
        start(async () => {
          try {
            const r = await saveOperationalSettingsAction({
              ngnPerUsd: String(fd.get("ngn_per_usd") ?? "") || null,
              lrdPerUsd: String(fd.get("lrd_per_usd") ?? "") || null,
              lowStockThresholdDefault: String(fd.get("low_stock_default") ?? "") || null,
              marginWarningPct: String(fd.get("margin_warning") ?? "") || null,
            });
            if (!r.ok) {
              setErr(r.error.replace(/_/g, " "));
              return;
            }
            router.refresh();
          } finally {
            lockRef.current = false;
          }
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <p className="text-xs text-white/45">
        Leave a field empty to use the official operational baseline (₦1385/USD · LD 190/USD). Admin values override
        defaults for dashboard, inventory, sales, and reports.
      </p>
      <label className="block text-xs text-white/55">
        NGN per 1 USD
        <input name="ngn_per_usd" className={field} inputMode="decimal" placeholder="e.g. 1385" defaultValue={majorOrEmpty(row?.ngn_per_usd)} />
      </label>
      <label className="block text-xs text-white/55">
        LRD per 1 USD
        <input name="lrd_per_usd" className={field} inputMode="decimal" placeholder="e.g. 190" defaultValue={majorOrEmpty(row?.lrd_per_usd)} />
      </label>
      <label className="block text-xs text-white/55">
        Default low-stock threshold (reference)
        <input
          name="low_stock_default"
          className={field}
          inputMode="decimal"
          placeholder="Optional"
          defaultValue={majorOrEmpty(row?.low_stock_threshold_default)}
        />
      </label>
      <label className="block text-xs text-white/55">
        Margin warning (% · SKUs below this retail margin are flagged on the dashboard)
        <input
          name="margin_warning"
          className={field}
          inputMode="decimal"
          placeholder="e.g. 12"
          defaultValue={majorOrEmpty(row?.margin_warning_pct)}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="admin-btn-primary rounded-full px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
