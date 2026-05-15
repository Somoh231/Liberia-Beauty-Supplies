/** Roles allowed into `/admin` (DB slug; includes legacy `admin` mapped to owner-tier in UI). */
export type AdminPortalRole = "owner" | "manager" | "staff" | "admin";

/** Front-desk employee: daily sales/service only — no pricing, inventory edits, or procurement. */
export function isSalonStaffRole(role: AdminPortalRole): boolean {
  return role === "staff";
}
