"use client";

import type { ConnectionDiagnosis } from "@/lib/env/supabase-connection-diagnosis";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatSupabaseAuthFailureMessage, validatePublicSupabaseEnv } from "@/lib/env/supabase-public";
import { safeAdminPostLoginPath } from "@/lib/auth/safe-admin-next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

function isMissingAdminPortalRpc(err: { message?: string; code?: string } | null | undefined) {
  const m = (err?.message ?? "").toLowerCase();
  const c = err?.code ?? "";
  // PostgREST: "Could not find the function public.can_access_admin_portal without parameters in the schema cache"
  if (c === "PGRST202") return true;
  if (m.includes("could not find the function") && m.includes("can_access_admin_portal")) return true;
  if (m.includes("schema cache") && m.includes("can_access_admin_portal")) return true;
  return false;
}

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [clientConfigIssues, setClientConfigIssues] = useState<string[] | null>(null);
  const [apiProbe, setApiProbe] = useState<
    | { state: "idle" }
    | { state: "checking" }
    | { state: "ok"; host: string; diagnosis: ConnectionDiagnosis }
    | { state: "fail"; message: string; diagnosis: ConnectionDiagnosis | null }
  >({ state: "idle" });
  const [pending, startTransition] = useTransition();

  const qpError = searchParams.get("error");
  const next = searchParams.get("next");

  useEffect(() => {
    const v = validatePublicSupabaseEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    if (!v.ok) {
      setClientConfigIssues(v.issues);
      setApiProbe({ state: "idle" });
      return;
    }
    setClientConfigIssues(null);
    setApiProbe({ state: "checking" });
    void fetch("/api/health/supabase")
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as {
          reachable?: boolean;
          host?: string;
          hint?: string;
          error?: string;
          issues?: string[];
          diagnosis?: ConnectionDiagnosis;
        };
        if (r.ok && body.reachable && body.host && body.diagnosis) {
          setApiProbe({ state: "ok", host: body.host, diagnosis: body.diagnosis });
        } else {
          const msg =
            body.hint ||
            body.error ||
            (Array.isArray(body.issues) ? body.issues.join(" ") : null) ||
            `HTTP ${r.status} from connection test`;
          setApiProbe({ state: "fail", message: msg, diagnosis: body.diagnosis ?? null });
        }
      })
      .catch((e: unknown) => {
        setApiProbe({
          state: "fail",
          message: e instanceof Error ? e.message : "Connection test failed.",
          diagnosis: null,
        });
      });
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const envCheck = validatePublicSupabaseEnv(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      );
      if (!envCheck.ok) {
        setError(envCheck.issues.join(" "));
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signErr) {
          const raw = signErr.message ?? "";
          if (/failed to fetch|networkerror|load failed/i.test(raw)) {
            setError(formatSupabaseAuthFailureMessage(new Error(raw)));
          } else if (signErr.message === "Invalid login credentials") {
            setError("Invalid email or password.");
          } else {
            setError(raw);
          }
          return;
        }

        const { data: ok, error: rpcErr } = await supabase.rpc("can_access_admin_portal");
        if (rpcErr) {
          const r = rpcErr.message ?? "";
          if (/failed to fetch|networkerror/i.test(r)) {
            setError(
              "Signed in, but the server could not verify admin access (RPC failed). Check your network connection first. If you’re online, confirm your Supabase migrations are applied (including `20260422133000_phase1_admin_portal_access.sql`).",
            );
            return;
          }
          if (isMissingAdminPortalRpc(rpcErr)) {
            await supabase.auth.signOut();
            setError(
              "Signed in, but your Supabase database is missing `public.can_access_admin_portal()`. Run the SQL migration `20260422133000_phase1_admin_portal_access.sql` in the Supabase SQL editor (or apply migrations), then try again.",
            );
            return;
          }
          await supabase.auth.signOut();
          setError(`Access check failed: ${r}`);
          return;
        }
        if (!ok) {
          await supabase.auth.signOut();
          setError("This account is not authorized for the admin portal. Ask an owner to assign a staff role in public.users.");
          return;
        }

        router.push(safeAdminPostLoginPath(next));
        router.refresh();
      } catch (caught) {
        setError(formatSupabaseAuthFailureMessage(caught));
      }
    });
  };

  const showConfigFromClient = clientConfigIssues && clientConfigIssues.length > 0;

  return (
    <form
      onSubmit={onSubmit}
      className="admin-card relative overflow-hidden p-8 sm:p-10"
      noValidate
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--admin-accent)]/12 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--admin-accent)]">
          Secure access
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-white sm:text-4xl">
          Admin sign in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Staff portal for Liberian Beauty Salon &amp; Supplies. Sessions are encrypted and scoped to this browser.
        </p>

        {showConfigFromClient ? (
          <div
            className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-100/95"
            role="alert"
          >
            <p className="font-medium text-amber-50">Supabase environment</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-100/85">
              {clientConfigIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : apiProbe.state === "checking" ? (
          <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/55">
            Checking connection to Supabase Auth…
          </p>
        ) : apiProbe.state === "ok" ? (
          <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3 text-xs text-emerald-100/90">
            <p>
              <span className="font-semibold text-emerald-50/95">Connection: OK</span>{" "}
              <span className="font-mono text-[11px] text-emerald-100/80">({apiProbe.host})</span>
            </p>
            <p className="mt-2 leading-relaxed text-emerald-100/85">{apiProbe.diagnosis.summary}</p>
            <p className="mt-2 text-[11px] text-emerald-100/75">
              If sign-in still fails, check email/password and that the user exists in Authentication with a matching
              row in <code className="rounded bg-black/25 px-1 font-mono text-[10px]">public.users</code>.
            </p>
          </div>
        ) : apiProbe.state === "fail" ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-xs leading-relaxed text-red-100/95" role="status">
            <p className="font-semibold text-red-50/95">Connection: failed</p>
            {apiProbe.diagnosis ? (
              <>
                <p className="mt-2 font-medium text-red-100/95">
                  <span className="text-[10px] uppercase tracking-wider text-red-200/80">Diagnosis · </span>
                  {apiProbe.diagnosis.code.replace(/_/g, " ")}
                </p>
                <p className="mt-1">{apiProbe.diagnosis.summary}</p>
                <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-[11px] text-red-100/85">
                  {apiProbe.diagnosis.fixes.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-2">{apiProbe.message}</p>
            )}
          </div>
        ) : null}

        {(qpError === "forbidden" || qpError === "config" || qpError === "server" || error) && (
          <p
            className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-100/95"
            role="alert"
          >
            {error ??
              (qpError === "forbidden"
                ? "Your account does not have admin access. Contact an owner if you need a role assigned."
                : qpError === "config"
                  ? "Server configuration is incomplete. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in web/.env.local to the values from Supabase → Settings → API, then restart the dev server."
                  : qpError === "server"
                    ? "We could not verify access right now. Most often this means the database migration that creates `public.can_access_admin_portal()` has not been applied yet. Run `20260422133000_phase1_admin_portal_access.sql` in Supabase SQL editor, then refresh and sign in again."
                    : null)}
          </p>
        )}

        <label className="mt-8 block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-fg-muted)]">Work email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={Boolean(showConfigFromClient)}
            className="admin-field mt-2 min-h-[52px] w-full rounded-2xl border border-[var(--admin-line)] bg-black/55 px-4 py-3.5 text-base text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]/50 focus:ring-1 focus:ring-[var(--admin-accent)]/25 disabled:cursor-not-allowed disabled:opacity-45"
          />
        </label>
        <label className="mt-5 block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-fg-muted)]">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={Boolean(showConfigFromClient)}
            className="admin-field mt-2 min-h-[52px] w-full rounded-2xl border border-[var(--admin-line)] bg-black/55 px-4 py-3.5 text-base text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]/50 focus:ring-1 focus:ring-[var(--admin-accent)]/25 disabled:cursor-not-allowed disabled:opacity-45"
          />
        </label>

        <button
          type="submit"
          disabled={pending || Boolean(showConfigFromClient)}
          className="admin-btn-primary mt-8 min-h-[52px] w-full rounded-2xl py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-8 text-center text-[11px] text-white/35">
          <Link href="/" className="text-[var(--admin-accent)] underline-offset-4 hover:underline">
            ← Back to website
          </Link>
        </p>
      </div>
    </form>
  );
}
