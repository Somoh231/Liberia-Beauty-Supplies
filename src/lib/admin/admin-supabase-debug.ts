/**
 * Structured debug logging for salon admin loaders + actions.
 *
 * In development, logs are always emitted. In production, set:
 *   SALON_ADMIN_SUPABASE_DEBUG=1
 */
export function salonAdminSupabaseDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SALON_ADMIN_SUPABASE_DEBUG === "1";
}

/** Client error boundaries: set NEXT_PUBLIC_SALON_ADMIN_SUPABASE_DEBUG=1 to show raw messages in admin UI */
export function salonAdminClientSupabaseDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SALON_ADMIN_SUPABASE_DEBUG === "1";
}

export function metaFromPostgrestError(err: unknown): Record<string, string | undefined> {
  if (!err || typeof err !== "object") return {};
  const o = err as { message?: string; code?: string; details?: string; hint?: string };
  return {
    supabaseMessage: o.message,
    supabaseCode: o.code,
    supabaseDetails: o.details,
    supabaseHint: o.hint,
  };
}

export function logSalonAdminSupabaseFailure(
  scope: string,
  err: unknown,
  meta?: Record<string, unknown>,
): void {
  if (!salonAdminSupabaseDebugEnabled()) return;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[salon-admin-supabase] ${scope}`, { message, stack, ...meta, ...metaFromPostgrestError(err) });
}
