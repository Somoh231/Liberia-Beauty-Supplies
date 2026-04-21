export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--fg-muted)]">404</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[var(--fg)]">
        Page not found
      </h1>
      <p className="mt-4 text-sm text-[var(--fg-muted)]">This internal tool only serves the staff portal.</p>
      <a
        href="/admin/login"
        className="mt-8 inline-flex min-h-[2.75rem] items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--fg)]/[0.04] px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg)] transition hover:bg-[var(--fg)]/[0.08]"
      >
        Go to login
      </a>
    </div>
  );
}
