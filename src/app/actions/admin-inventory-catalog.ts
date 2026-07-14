"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { requireOwner } from "@/lib/auth/admin-guards";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";

/**
 * Soft catalog clear is deprecated. Use Settings → hard sales & inventory reset.
 */
export async function clearActiveInventoryCatalogAction(_input?: {
  confirmation: string;
  reason: string;
}): Promise<SalonActionResult> {
  void _input;
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;
  return { ok: false, error: "deprecated_use_hard_reset" };
}
