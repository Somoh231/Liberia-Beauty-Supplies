import type { ReactNode } from "react";

type Variant = "default" | "amber" | "rose" | "emerald";

const ring: Record<Variant, string> = {
  default: "from-[var(--admin-accent)]/35 via-white/10 to-transparent",
  amber: "from-amber-400/35 via-amber-200/10 to-transparent",
  rose: "from-rose-400/35 via-rose-200/10 to-transparent",
  emerald: "from-emerald-400/30 via-emerald-200/10 to-transparent",
};

export function AdminLuxKpiCard({
  label,
  value,
  hint,
  variant = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  variant?: Variant;
  icon?: ReactNode;
}) {
  return (
    <div className="admin-card-lift group relative overflow-hidden rounded-2xl border border-[var(--admin-line)] bg-gradient-to-br from-[#141418]/95 via-[#0c0c0f]/92 to-[#08080a]/95 p-5 shadow-[var(--admin-shadow-soft)] sm:p-6">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${ring[variant]} opacity-90`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-fg-muted)]">{label}</p>
          <div className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[var(--admin-fg)] tabular-nums sm:text-[1.65rem]">
            {value}
          </div>
          {hint ? <p className="text-[11px] leading-snug text-[var(--admin-fg-muted)]">{hint}</p> : null}
        </div>
        {icon ? (
          <div className="shrink-0 rounded-xl border border-white/[0.06] bg-white/[0.04] p-2.5 text-[var(--admin-accent)] transition group-hover:border-[var(--admin-accent)]/25 group-hover:bg-[var(--admin-accent)]/8">
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
