import { validatePublicSupabaseEnv } from "@/lib/env/supabase-public";
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const v = validatePublicSupabaseEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!v.ok) {
    throw new Error(v.issues.join(" "));
  }
  return createBrowserClient(v.url, v.anonKey);
}
