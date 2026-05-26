import { AdminLoginEnvBanner } from "@/components/admin/admin-login-env-banner";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { validatePublicSupabaseEnv } from "@/lib/env/supabase-public";
import { isPortalProfileAllowed } from "@/lib/auth/admin-portal-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { signOutAdmin } from "@/app/actions/admin-auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Secure admin sign-in for Liberian Beauty Salon & Supplies.",
};

export const dynamic = "force-dynamic";

async function SessionConflictBanner() {
  try {
    const env = validatePublicSupabaseEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    if (!env.ok) return null;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || isPortalProfileAllowed(profile)) return null;

    return (
      <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100/90">
        <p>
          You are signed in as <strong>{user.email ?? "your account"}</strong>, but this account is not assigned an admin
          role.
        </p>
        <form action={signOutAdmin} className="mt-3">
          <button
            type="submit"
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)] underline-offset-4 hover:underline"
          >
            Sign out and use a different account
          </button>
        </form>
      </div>
    );
  } catch {
    /* Avoid 500 on login when Supabase session/RPC is temporarily unavailable */
    return null;
  }
}

export default function AdminLoginPage() {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-14 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(212,184,150,0.14),transparent_50%),radial-gradient(ellipse_70%_50%_at_100%_50%,rgba(120,90,140,0.06),transparent_45%),linear-gradient(180deg,#050506_0%,#070708_45%,#050506_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a962' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--admin-accent)]/40 to-transparent" />

      <div className="relative w-full max-w-[440px]">
        <p className="mb-8 text-center font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-white/95 sm:text-[1.65rem]">
          Liberian Beauty
          <span className="block text-[11px] font-normal uppercase tracking-[0.28em] text-[var(--admin-accent)]/90">Staff portal</span>
        </p>
        <AdminLoginEnvBanner />
        <Suspense fallback={null}>
          <SessionConflictBanner />
        </Suspense>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.06]" />}>
          <AdminLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
