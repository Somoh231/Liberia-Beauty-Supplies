"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { requireOwner } from "@/lib/auth/admin-guards";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";
import { logSalonAdminSupabaseFailure } from "@/lib/admin/admin-supabase-debug";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const CONFIRM_PHRASE = "RESET SALES AND INVENTORY";

export type OperationalResetPreview = {
  sales: number;
  sales_edit_log: number;
  inventory_items: number;
  inventory_movements: number;
  inventory_correction_log: number;
  inventory_import_batches: number;
  purchases: number;
  purchase_lines: number;
  weekly_product_sales: number;
  service_logs_with_product_usage: number;
  reconciliations_live: number;
  preserved: string[];
  fx: { ngn_per_usd: number; lrd_per_usd: number };
};

function revalidateAfterReset() {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/sales-log");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/purchases");
  revalidatePath("/admin/reconcile");
  revalidatePath("/admin/settings");
}

export async function previewOperationalResetAction(): Promise<
  SalonActionResult & { preview?: OperationalResetPreview }
> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_preview_operational_reset");

  if (error) {
    logSalonAdminSupabaseFailure("rpc:admin_preview_operational_reset", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    const msg = error.message ?? "";
    if (error.code === "PGRST202" || msg.includes("admin_preview_operational_reset")) {
      return { ok: false, error: "migration_required" };
    }
    if (msg.includes("unauthorized") || msg.includes("42501")) {
      return { ok: false, error: "forbidden_owner_required" };
    }
    return { ok: false, error: "preview_failed" };
  }

  return { ok: true, preview: data as OperationalResetPreview };
}

/**
 * Owner-only destructive reset. Must never be called without UI confirmation + backup checkbox.
 * Does not run automatically.
 */
export async function resetSalesAndInventoryAction(input: {
  confirmation: string;
  reason: string;
  backupConfirmed: boolean;
  backupReference?: string | null;
  workbookFilename?: string | null;
  workbookSha256?: string | null;
}): Promise<SalonActionResult & { resetId?: string }> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  if (input.confirmation?.trim() !== CONFIRM_PHRASE) {
    return { ok: false, error: "confirmation_mismatch" };
  }
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 3) return { ok: false, error: "reason_required" };
  if (!input.backupConfirmed) return { ok: false, error: "backup_confirmation_required" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_reset_sales_and_inventory", {
    p_payload: {
      confirmation: CONFIRM_PHRASE,
      reason,
      backup_confirmed: true,
      backup_reference: input.backupReference?.trim() || null,
      workbook_filename: input.workbookFilename?.trim() || null,
      workbook_sha256: input.workbookSha256?.trim() || null,
    },
  });

  if (error) {
    logSalonAdminSupabaseFailure("rpc:admin_reset_sales_and_inventory", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    const msg = (error.message ?? "").toLowerCase();
    if (error.code === "PGRST202" || msg.includes("admin_reset_sales_and_inventory")) {
      return { ok: false, error: "migration_required" };
    }
    if (msg.includes("unauthorized") || msg.includes("42501") || msg.includes("forbidden")) {
      return { ok: false, error: "forbidden_owner_required" };
    }
    if (msg.includes("confirmation_mismatch")) return { ok: false, error: "confirmation_mismatch" };
    if (msg.includes("reason_required")) return { ok: false, error: "reason_required" };
    if (msg.includes("backup_confirmation_required")) return { ok: false, error: "backup_confirmation_required" };
    return { ok: false, error: "reset_failed" };
  }

  revalidateAfterReset();
  return { ok: true, resetId: typeof data === "string" ? data : undefined };
}

export { CONFIRM_PHRASE as OPERATIONAL_RESET_CONFIRM_PHRASE };
