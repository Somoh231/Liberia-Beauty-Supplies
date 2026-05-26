import type { AdminContext } from "@/lib/auth/admin-context";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";

export function staffForbidden(): SalonActionResult {
  return { ok: false, error: "forbidden_staff_role" };
}

export function managerForbidden(): SalonActionResult {
  return { ok: false, error: "forbidden_manager_required" };
}

export function ownerForbidden(): SalonActionResult {
  return { ok: false, error: "forbidden_owner_required" };
}

export function requirePortalUser(ctx: AdminContext | null): SalonActionResult | null {
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!ctx.isActive) return { ok: false, error: "account_inactive" };
  return null;
}

export function requireNotStaff(ctx: AdminContext | null): SalonActionResult | null {
  const base = requirePortalUser(ctx);
  if (base) return base;
  if (ctx!.isStaff) return staffForbidden();
  return null;
}

export function requireManagerOrAbove(ctx: AdminContext | null): SalonActionResult | null {
  const base = requirePortalUser(ctx);
  if (base) return base;
  if (!ctx!.isManagerOrAbove) return managerForbidden();
  return null;
}

export function requireOwner(ctx: AdminContext | null): SalonActionResult | null {
  const base = requirePortalUser(ctx);
  if (base) return base;
  if (!ctx!.isOwner) return ownerForbidden();
  return null;
}
