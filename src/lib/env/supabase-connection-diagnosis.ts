/**
 * Human-readable diagnosis for Supabase connectivity failures (health API + login UI).
 */

export type ConnectionDiagnosis = {
  code: string;
  summary: string;
  fixes: string[];
};

const RESTART_FIX = "Save `web/.env.local`, then stop the dev server completely and run `npm run dev` again (Next.js bakes `NEXT_PUBLIC_*` at startup).";

export function diagnosisFromEnvIssues(issues: string[]): ConnectionDiagnosis {
  const j = issues.join(" ").toLowerCase();
  if (
    j.includes("template") ||
    j.includes("your_project_ref") ||
    j.includes("placeholder") ||
    j.includes("your_anon")
  ) {
    return {
      code: "supabase_env_placeholder",
      summary: "Supabase URL or anon key is still a template — the browser cannot reach a real project.",
      fixes: [
        "Open Supabase → Project Settings → API.",
        "Copy Project URL → `NEXT_PUBLIC_SUPABASE_URL` (must look like `https://abcdefghij.supabase.co`).",
        "Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (long JWT starting with `eyJ`).",
        RESTART_FIX,
      ],
    };
  }
  if (j.includes("too short")) {
    return {
      code: "anon_key_incomplete",
      summary: "The anon key looks too short or was pasted incompletely.",
      fixes: [
        "Supabase → Settings → API → copy the entire **anon public** key in one paste.",
        RESTART_FIX,
      ],
    };
  }
  if (j.includes("https") || j.includes("http")) {
    return {
      code: "invalid_url_protocol",
      summary: "The project URL protocol is not allowed for this setup.",
      fixes: ["Use `https://` for hosted Supabase, or `http://127.0.0.1` only for local CLI.", RESTART_FIX],
    };
  }
  return {
    code: "env_validation_failed",
    summary: "Public Supabase environment variables failed validation.",
    fixes: [...issues, RESTART_FIX],
  };
}

export function diagnosisFromFetchError(host: string, message: string): ConnectionDiagnosis {
  const m = message.toLowerCase();
  if (m.includes("enotfound") || m.includes("getaddrinfo") || m.includes("name not resolved")) {
    const looksTemplate = host.toLowerCase().includes("your_project_ref") || host.includes("placeholder");
    return {
      code: "dns_unreachable",
      summary: looksTemplate
        ? `Host "${host}" is not a real Supabase project (template hostname).`
        : `Host "${host}" could not be resolved — DNS or project paused.`,
      fixes: looksTemplate
        ? [
            "Replace `NEXT_PUBLIC_SUPABASE_URL` with your real `https://<ref>.supabase.co` URL from the dashboard.",
            RESTART_FIX,
          ]
        : [
            "Confirm the Supabase project is **not paused** (Dashboard → project status).",
            "Verify the URL matches **Settings → API → Project URL** exactly.",
            "Check VPN / firewall / corporate proxy blocking `*.supabase.co`.",
            RESTART_FIX,
          ],
    };
  }
  if (m.includes("abort") || m.includes("timeout")) {
    return {
      code: "network_timeout",
      summary: "The health request to Supabase Auth timed out.",
      fixes: ["Check network stability and firewall rules.", "Confirm the project URL is correct.", RESTART_FIX],
    };
  }
  if (m.includes("certificate") || m.includes("ssl") || m.includes("tls")) {
    return {
      code: "tls_error",
      summary: "A TLS/SSL error occurred talking to Supabase.",
      fixes: ["Ensure you use the official `https://*.supabase.co` URL.", "Check for HTTPS intercepting proxies."],
    };
  }
  return {
    code: "network_unknown",
    summary: message || "Unknown network error reaching Supabase.",
    fixes: ["Verify Project URL and anon key.", "Try from another network to rule out blocking.", RESTART_FIX],
  };
}

export function diagnosisFromAuthHttpStatus(status: number): ConnectionDiagnosis {
  if (status === 502 || status === 503) {
    return {
      code: "supabase_paused_or_unavailable",
      summary: `Supabase returned HTTP ${status} — the project is often paused, restarting, or temporarily unavailable.`,
      fixes: [
        "Open the Supabase dashboard and confirm the project is **Active** (resume if it was paused for inactivity).",
        "Wait a minute and retry if the project was just restored.",
        RESTART_FIX,
      ],
    };
  }
  return {
    code: "auth_health_http_error",
    summary: `Supabase Auth health endpoint returned HTTP ${status}.`,
    fixes: [
      status === 401 || status === 403
        ? "The anon key may be wrong or revoked — paste a fresh anon public key from Settings → API."
        : "The project may be migrating, or the URL may point at the wrong project.",
      RESTART_FIX,
    ],
  };
}
