"use client";

import { salonAdminClientSupabaseDebugEnabled } from "@/lib/admin/admin-supabase-debug";

export default function AdminInventoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const debug = salonAdminClientSupabaseDebugEnabled();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--admin-fg)] sm:text-4xl">
          Inventory
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--admin-fg-muted)]">
          {debug
            ? "Debug mode: detailed error information is shown below."
            : "Something went wrong while rendering this page."}
        </p>
      </header>

      <section className="admin-card border border-red-500/25 bg-red-500/[0.08] p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-200/90">Error</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--admin-fg)]">Inventory unavailable</h2>
        <p className="mt-4 text-sm leading-relaxed text-red-100/90">{error.message}</p>
        {debug && error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-red-100/75">digest: {error.digest}</p>
        ) : null}
        {debug && error.stack ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[10px] leading-relaxed text-white/70">
            {error.stack}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="admin-btn-primary rounded-lg px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]"
          >
            Try again
          </button>
        </div>
        <p className="mt-6 text-sm text-[var(--admin-fg-muted)]">
          If this persists after a refresh, confirm Supabase migrations are applied and your session is still valid.
          {debug ? " Server logs also appear when SALON_ADMIN_SUPABASE_DEBUG=1 is set." : null}
        </p>
      </section>
    </div>
  );
}
