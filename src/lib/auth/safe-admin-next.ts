/** Default landing after staff sign-in when `next` is missing or unsafe. */
export const ADMIN_POST_LOGIN_DEFAULT = "/admin";

/** Marketing hard-nav target for inventory (full document load from public site). */
export const ADMIN_INVENTORY_DASH_PATH = "/admin/inventory";

/** Marketing + middleware target for staff authentication. */
export const STAFF_LOGIN_PATH = "/admin/login";

/**
 * Validates `next` from query params so we never redirect to login (loop) or off-site.
 * Safe for Edge middleware and the browser login form.
 */
export function safeAdminPostLoginPath(next: string | null | undefined): string {
  if (next == null) return ADMIN_POST_LOGIN_DEFAULT;
  const t = typeof next === "string" ? next.trim() : "";
  if (!t) return ADMIN_POST_LOGIN_DEFAULT;
  if (t.length > 512) return ADMIN_POST_LOGIN_DEFAULT;
  if (!t.startsWith("/") || t.startsWith("//")) return ADMIN_POST_LOGIN_DEFAULT;
  if (!t.startsWith("/admin")) return ADMIN_POST_LOGIN_DEFAULT;
  if (
    t === STAFF_LOGIN_PATH ||
    t.startsWith(`${STAFF_LOGIN_PATH}/`) ||
    t.startsWith(`${STAFF_LOGIN_PATH}?`) ||
    t.startsWith(`${STAFF_LOGIN_PATH}#`)
  ) {
    return ADMIN_POST_LOGIN_DEFAULT;
  }
  return t;
}
