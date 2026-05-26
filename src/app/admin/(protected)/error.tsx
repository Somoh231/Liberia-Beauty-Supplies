"use client";

import { salonAdminClientSupabaseDebugEnabled } from "@/lib/admin/admin-supabase-debug";
import Link from "next/link";

/** Catches server errors for /admin/* protected routes (except nested segments with their own error.tsx). */
export default function AdminProtectedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const debug = salonAdminClientSupabaseDebugEnabled();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-[max(1rem,env(safe-area-inset-left))] pb-10 pt-8">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Admin portal
        </h1>
        <p className="max-w-2xl text-sm text-white/50">
          {debug
            ? "Debug mode: detailed error information is shown below."
            : "Something went wrong while loading this section."}
        </p>
      </header>

      <section className="admin-card border border-red-500/25 bg-red-500/[0.08] p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-200/90">Error</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-white">This page could not be loaded</h2>
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
            className="rounded-lg border border-[var(--admin-accent)]/45 bg-[var(--admin-accent)]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)] transition hover:bg-[var(--admin-accent)]/20"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg border border-white/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 hover:bg-white/[0.06]"
          >
            Dashboard
          </Link>
        </div>
        <p className="mt-6 text-sm text-white/45">
          Set NEXT_PUBLIC_SALON_ADMIN_SUPABASE_DEBUG=1 for client details; SALON_ADMIN_SUPABASE_DEBUG=1 for server logs.
        </p>
      </section>
    </div>
  );
}
