import type { SalonRole } from "@/lib/auth/admin-roles";

const OWNER_ONLY_PREFIXES = ["/admin/users"] as const;

const MANAGER_OR_ABOVE_PREFIXES = [
  "/admin/settings",
  "/admin/reconcile",
  "/admin/inventory/import",
  "/admin/inventory/new",
  "/admin/purchases",
  "/admin/suppliers",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Server-side route gate — never trust client role state alone. */
export function isAdminRouteAllowed(pathname: string, role: SalonRole): boolean {
  if (OWNER_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return role === "owner";
  }
  if (MANAGER_OR_ABOVE_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return role === "owner" || role === "manager";
  }
  return true;
}
