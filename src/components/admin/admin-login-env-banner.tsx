import { validatePublicSupabaseEnv } from "@/lib/env/supabase-public";

/**
 * Server-rendered banner when public Supabase env is missing or looks like a template.
 */
export function AdminLoginEnvBanner() {
  const v = validatePublicSupabaseEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (v.ok) return null;

  return (
    <div
      className="mb-8 rounded-2xl border border-amber-500/35 bg-amber-950/40 px-5 py-4 text-left text-sm text-amber-50/95 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]"
      role="region"
      aria-label="Configuration notice"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/90">Configuration</p>
      <p className="mt-2 font-medium text-amber-50">Supabase client cannot connect reliably until this is fixed:</p>
      <ul className="mt-3 list-inside list-disc space-y-1.5 text-xs leading-relaxed text-amber-100/85">
        {v.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-amber-200/70">
        Edit <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-amber-50/90">web/.env.local</code>, then stop and restart{" "}
        <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-amber-50/90">npm run dev</code>.
      </p>
    </div>
  );
}
