import { validatePublicSupabaseEnv } from "@/lib/env/supabase-public";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type TryCreateSupabaseServerClientResult =
  | { ok: true; supabase: SupabaseClient }
  | { ok: false; message: string };

/**
 * Same as {@link createSupabaseServerClient} but never throws — use in pages that should
 * render a friendly error instead of a generic HTTP 500 (e.g. missing/invalid public env).
 */
export async function tryCreateSupabaseServerClient(): Promise<TryCreateSupabaseServerClientResult> {
  try {
    const supabase = await createSupabaseServerClient();
    return { ok: true, supabase };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not initialize Supabase client.",
    };
  }
}

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Respects the logged-in user's JWT and RLS policies.
 */
export async function createSupabaseServerClient() {
  const v = validatePublicSupabaseEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!v.ok) {
    throw new Error(v.issues.join(" "));
  }

  const cookieStore = await cookies();

  return createServerClient(v.url, v.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* set() can throw in Server Components — middleware keeps session fresh */
        }
      },
    },
  });
}
