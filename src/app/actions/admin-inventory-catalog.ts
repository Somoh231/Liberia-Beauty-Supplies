"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { requireOwner } from "@/lib/auth/admin-guards";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";
import { logSalonAdminSupabaseFailure } from "@/lib/admin/admin-supabase-debug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const CONFIRM_PHRASE = "CLEAR INVENTORY";

function revalidateInventoryCatalog() {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/sales-log");
}

export async function clearActiveInventoryCatalogAction(input: {
  confirmation: string;
  reason: string;
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const confirmation = input.confirmation?.trim() ?? "";
  if (confirmation !== CONFIRM_PHRASE) {
    return { ok: false, error: "confirmation_mismatch" };
  }

  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) {
    return { ok: false, error: "reason_required" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_clear_active_inventory_catalog", {
    p_payload: { reason },
  });

  if (error) {
    logSalonAdminSupabaseFailure("rpc:admin_clear_active_inventory_catalog", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    const msg = error.message ?? "reset_failed";
    if (error.code === "PGRST202" || msg.includes("admin_clear_active_inventory_catalog")) {
      return { ok: false, error: "migration_required" };
    }
    if (msg.includes("forbidden_owner_required") || msg.includes("42501")) {
      return { ok: false, error: "forbidden_owner_required" };
    }
    if (msg.includes("reason_required")) return { ok: false, error: "reason_required" };
    return { ok: false, error: msg };
  }

  revalidateInventoryCatalog();
  return { ok: true };
}
