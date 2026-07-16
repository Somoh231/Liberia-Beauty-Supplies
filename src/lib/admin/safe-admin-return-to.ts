/** Default landing after Sales Log source edits. */
export const DEFAULT_ADMIN_RETURN_TO = "/admin/sales-log";

/**
 * Sanitize returnTo query/form values for post-edit redirects.
 * Accepts only internal admin paths; never trusts raw client input.
 */
export function sanitizeAdminReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_ADMIN_RETURN_TO;

  const value = raw.trim();
  if (!value) return DEFAULT_ADMIN_RETURN_TO;

  // Protocol URLs and schemes (http:, https:, javascript:, data:, …)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return DEFAULT_ADMIN_RETURN_TO;

  // Protocol-relative
  if (value.startsWith("//")) return DEFAULT_ADMIN_RETURN_TO;

  // Must be an absolute internal admin path
  if (!value.startsWith("/admin/")) return DEFAULT_ADMIN_RETURN_TO;

  // Path traversal / control characters / backslash tricks
  if (value.includes("..") || value.includes("\\") || value.includes("\0") || /[\r\n\t]/.test(value)) {
    return DEFAULT_ADMIN_RETURN_TO;
  }

  // Disallow characters that enable odd URL embedding
  if (/[<>'"`]/.test(value)) return DEFAULT_ADMIN_RETURN_TO;

  return value;
}
