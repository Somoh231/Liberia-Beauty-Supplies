/** Canonical salon portal roles (matches user_profiles.role). */
export type SalonRole = "owner" | "manager" | "staff";

/** DB slug including legacy `admin` mapped to owner tier in app. */
export type AdminPortalRole = SalonRole | "admin";

export function normalizeSalonRole(slug: string | null | undefined): SalonRole | null {
  if (!slug) return null;
  if (slug === "admin" || slug === "owner") return "owner";
  if (slug === "manager") return "manager";
  if (slug === "staff") return "staff";
  return null;
}

export function isSalonOwnerRole(role: AdminPortalRole): boolean {
  return role === "owner" || role === "admin";
}

export function isSalonManagerOrAboveRole(role: AdminPortalRole): boolean {
  return isSalonOwnerRole(role) || role === "manager";
}

/** Front-desk employee: daily sales/service only — no pricing, inventory edits, or procurement. */
export function isSalonStaffRole(role: AdminPortalRole): boolean {
  return role === "staff";
}

export function roleBadgeLabel(role: AdminPortalRole): string {
  const n = normalizeSalonRole(role);
  if (n === "owner") return "OWNER";
  if (n === "manager") return "MANAGER";
  return "STAFF";
}
