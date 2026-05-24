"use client";

import { formatOperationalFxSummaryLine } from "@/lib/admin/pricing-engine";

/** Lightweight operational FX disclosure (client-safe env fallbacks, or server-provided line from DB settings). */
export function OperationalFxBanner({
  className = "",
  summaryLine,
}: {
  className?: string;
  /** When set (e.g. from server using `operational_settings`), overrides env-only line. */
  summaryLine?: string;
}) {
  const line = summaryLine ?? formatOperationalFxSummaryLine();
  return (
    <p
      className={`rounded-lg border border-[var(--admin-accent)]/20 bg-[var(--admin-accent)]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-white/60 ${className}`}
      role="note"
    >
      <span className="font-semibold text-[var(--admin-accent)]/95">Operational FX:</span> {line} · same rates as inventory, sales, and reports (
      <span className="text-white/45">₦1385/USD baseline when settings are empty</span>)
    </p>
  );
}
