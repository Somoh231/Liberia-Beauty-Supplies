import type { PostgrestError } from "@supabase/supabase-js";

export function logAdminQueryStart(scope: string, query: string, params?: Record<string, unknown>): void {
  console.error("[admin-debug]", { scope, query, params: params ?? {} });
}

export function logAdminQueryResult(
  scope: string,
  error: PostgrestError | Error | null | undefined,
  dataShape: unknown,
): void {
  console.error("[admin-debug-result]", {
    scope,
    error: error
      ? {
          message: error.message,
          code: "code" in error ? (error as PostgrestError).code : undefined,
          details: "details" in error ? (error as PostgrestError).details : undefined,
          hint: "hint" in error ? (error as PostgrestError).hint : undefined,
        }
      : null,
    dataShape,
  });
}

export function dataShapeOf(data: unknown): Record<string, unknown> {
  if (data == null) return { kind: "null" };
  if (Array.isArray(data)) return { kind: "array", length: data.length };
  if (typeof data === "object") return { kind: "object", keys: Object.keys(data as object).slice(0, 12) };
  return { kind: typeof data };
}

export function isMissingColumnError(error: PostgrestError | null | undefined, column: string): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  const col = column.toLowerCase();
  return m.includes(col) && (m.includes("column") || m.includes("does not exist") || error.code === "42703");
}
