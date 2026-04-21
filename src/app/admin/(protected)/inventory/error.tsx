"use client";

export default function AdminInventoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--admin-fg)] sm:text-4xl">
          Inventory
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--admin-fg-muted)]">
          Something went wrong while rendering this page.
        </p>
      </header>

      <section className="admin-card border border-red-500/25 bg-red-500/[0.08] p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-200/90">Error</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--admin-fg)]">Inventory unavailable</h2>
        <p className="mt-4 text-sm leading-relaxed text-red-100/90">{error.message}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-[var(--admin-accent)]/45 bg-[var(--admin-accent)]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/20"
          >
            Try again
          </button>
        </div>
        <p className="mt-6 text-sm text-[var(--admin-fg-muted)]">
          If this persists after a refresh, confirm Supabase migrations are applied and your session is still valid.
        </p>
      </section>
    </div>
  );
}
