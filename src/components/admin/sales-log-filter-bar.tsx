"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  buildSalesLogHref,
  salesLogRangeLabel,
  type ParsedSalesLogFilter,
  type SalesLogRange,
  type SalesLogSource,
} from "@/lib/admin/sales-log-filters";
import { cn } from "@/lib/utils";

const RANGE_PRESETS: { range: SalesLogRange; label: string }[] = [
  { range: "today", label: "Today" },
  { range: "7d", label: "Last 7 days" },
  { range: "month", label: "This month" },
  { range: "all", label: "All time" },
];

const SOURCE_PRESETS: { source: SalesLogSource; label: string }[] = [
  { source: "all", label: "All" },
  { source: "retail", label: "Retail" },
  { source: "services", label: "Services" },
  { source: "stylist-fees", label: "Stylist fees" },
];

const chip =
  "inline-flex min-h-[2.25rem] items-center rounded-full border px-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-accent)]";

export function SalesLogFilterBar({ filter }: { filter: ParsedSalesLogFilter }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customFrom, setCustomFrom] = useState(
    filter.range === "custom" && filter.from ? filter.from : filter.bounds.kind === "bounded" ? filter.bounds.fromYmd : "",
  );
  const [customTo, setCustomTo] = useState(
    filter.range === "custom" && filter.to
      ? filter.to
      : filter.bounds.kind === "bounded"
        ? filter.bounds.toYmdInclusive
        : "",
  );

  const source = filter.source;

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    start(() => {
      router.push(buildSalesLogHref({ range: "custom", from: customFrom, to: customTo, source }));
    });
  }

  return (
    <section className="admin-card space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Filters</h2>
          <p className="mt-1 text-xs text-white/45">
            {salesLogRangeLabel(filter)}
            {source !== "all" ? ` · ${SOURCE_PRESETS.find((s) => s.source === source)?.label ?? source}` : ""}
            {filter.usedFallback ? " · invalid URL params reset to safe defaults" : ""}
          </p>
        </div>
        <Link
          href={buildSalesLogHref({ range: "month", source: "all" })}
          className={cn(chip, "border-white/15 text-white/70 hover:border-white/30 hover:text-white")}
        >
          Clear filters
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p.range}
            href={buildSalesLogHref({ range: p.range, source })}
            className={cn(
              chip,
              filter.range === p.range
                ? "border-[var(--admin-accent)]/45 bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]"
                : "border-white/12 text-white/60 hover:border-white/25 hover:text-white",
            )}
            aria-current={filter.range === p.range ? "page" : undefined}
          >
            {p.label}
          </Link>
        ))}
        <span
          className={cn(
            chip,
            filter.range === "custom"
              ? "border-[var(--admin-accent)]/45 bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]"
              : "border-white/12 text-white/60",
          )}
        >
          Custom range
        </span>
      </div>

      <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-3">
        <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Start date
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="mt-1 block min-h-[2.5rem] rounded-xl border border-white/12 bg-black/30 px-3 text-sm text-white focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30"
            required
          />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          End date
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="mt-1 block min-h-[2.5rem] rounded-xl border border-white/12 bg-black/30 px-3 text-sm text-white focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30"
            required
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={cn(chip, "border-[var(--admin-accent)]/40 text-[var(--admin-accent)] hover:bg-[var(--admin-accent-soft)] disabled:opacity-50")}
        >
          Apply range
        </button>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        {SOURCE_PRESETS.map((p) => (
          <Link
            key={p.source}
            href={buildSalesLogHref({
              range: filter.range,
              source: p.source,
              from: filter.range === "custom" ? filter.from : null,
              to: filter.range === "custom" ? filter.to : null,
            })}
            className={cn(
              chip,
              filter.source === p.source
                ? "border-[var(--admin-accent)]/45 bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]"
                : "border-white/12 text-white/60 hover:border-white/25 hover:text-white",
            )}
            aria-current={filter.source === p.source ? "page" : undefined}
          >
            {p.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
