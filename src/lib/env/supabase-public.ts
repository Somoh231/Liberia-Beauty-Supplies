/**
 * Validates public Supabase env used in the browser bundle.
 * Catches placeholder .env and misconfiguration that cause `signInWithPassword` to fail with "Failed to fetch".
 */

export type PublicSupabaseValidation =
  | { ok: true; url: string; anonKey: string }
  | { ok: false; issues: string[] };

const PLACEHOLDER_URL_SNIPPETS = ["your_project_ref", "placeholder", "xxxx", "example.supabase"];

const PLACEHOLDER_KEY_SNIPPETS = ["your_anon", "placeholder", "xxxx", "changeme"];

export function validatePublicSupabaseEnv(
  url: string | undefined,
  anonKey: string | undefined,
): PublicSupabaseValidation {
  const issues: string[] = [];
  const u = url?.trim() ?? "";
  const a = anonKey?.trim() ?? "";

  if (!u) issues.push("NEXT_PUBLIC_SUPABASE_URL is missing or empty.");
  if (!a) issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or empty.");
  if (issues.length) return { ok: false, issues };

  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return { ok: false, issues: ["NEXT_PUBLIC_SUPABASE_URL is not a valid URL (copy the full https://… URL from Supabase → Settings → API)."] };
  }

  const host = parsed.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const protocolOk = parsed.protocol === "https:" || (isLocal && parsed.protocol === "http:");
  if (!protocolOk) {
    issues.push("Use https:// for your Supabase project URL (http is only allowed for localhost CLI).");
  }

  // Hosted Supabase uses *.supabase.co; self-hosted / custom API domains are valid too — do not hard-fail here.

  const lowerU = u.toLowerCase();
  if (PLACEHOLDER_URL_SNIPPETS.some((p) => lowerU.includes(p))) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL still looks like a template — paste your real Project URL.");
  }

  if (a.length < 80) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short — paste the full anon public key from Supabase → Settings → API.");
  } else if (!a.startsWith("eyJ")) {
    issues.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY should normally be a JWT starting with eyJ. If you use a custom stack, confirm you pasted the anon public key (not the service_role secret).",
    );
  }

  const lowerA = a.toLowerCase();
  if (PLACEHOLDER_KEY_SNIPPETS.some((p) => lowerA.includes(p))) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY still looks like a placeholder — paste the anon public key from Supabase.");
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, url: u, anonKey: a };
}

export function formatSupabaseAuthFailureMessage(err: unknown): string {
  if (err instanceof TypeError) {
    const m = err.message?.toLowerCase() ?? "";
    if (m.includes("fetch") || m.includes("network") || m.includes("failed")) {
      return [
        "Could not reach Supabase (network error).",
        "Check: (1) NEXT_PUBLIC_SUPABASE_URL in .env.local is your real https://…supabase.co URL, (2) you restarted `npm run dev` after editing env, (3) no VPN/ad-blocker is blocking the request, (4) the project is not paused in the Supabase dashboard.",
      ].join(" ");
    }
  }
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const msg = (err as { message: string }).message;
    const lower = msg.toLowerCase();
    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return [
        "Could not reach Supabase.",
        "Usually this means the Project URL is wrong, still a placeholder, or the browser cannot resolve the host. Confirm NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in web/.env.local match Supabase → Settings → API, then restart the dev server.",
      ].join(" ");
    }
    return msg;
  }
  return "Sign-in failed. Check your connection and Supabase configuration.";
}
