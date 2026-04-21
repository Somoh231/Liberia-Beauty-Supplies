import {
  diagnosisFromAuthHttpStatus,
  diagnosisFromEnvIssues,
  diagnosisFromFetchError,
} from "@/lib/env/supabase-connection-diagnosis";
import { validatePublicSupabaseEnv } from "@/lib/env/supabase-public";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Server-side reachability check for the configured Supabase Auth API.
 * Returns structured `diagnosis` for the admin login UI.
 */
export async function GET() {
  const v = validatePublicSupabaseEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!v.ok) {
    const diagnosis = diagnosisFromEnvIssues(v.issues);
    return NextResponse.json(
      {
        ok: false,
        reachable: false,
        issues: v.issues,
        diagnosis,
      },
      { status: 503 },
    );
  }

  const base = v.url.replace(/\/$/, "");
  const healthUrl = `${base}/auth/v1/health`;
  let host: string;
  try {
    host = new URL(v.url).hostname;
  } catch {
    host = "";
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        apikey: v.anonKey,
      },
    });
    clearTimeout(t);

    if (!res.ok) {
      const diagnosis = diagnosisFromAuthHttpStatus(res.status);
      return NextResponse.json(
        {
          ok: false,
          reachable: false,
          host,
          authHealthStatus: res.status,
          hint: diagnosis.summary,
          diagnosis,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      reachable: true,
      host,
      authHealthStatus: res.status,
      diagnosis: {
        code: "ok",
        summary: `Auth API reachable at ${host}.`,
        fixes: ["You can sign in if email/password and `public.users` role are correct."],
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const diagnosis = diagnosisFromFetchError(host || "unknown", msg);
    return NextResponse.json(
      {
        ok: false,
        reachable: false,
        host,
        error: msg,
        hint: diagnosis.summary,
        diagnosis,
      },
      { status: 503 },
    );
  }
}
