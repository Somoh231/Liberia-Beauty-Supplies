"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { requireManagerOrAbove } from "@/lib/auth/admin-guards";
import { parseInventoryWorkbookBuffer } from "@/lib/admin/inventory-import/workbook-parser";
import type { InventoryImportPreviewReport } from "@/lib/admin/inventory-import/types";
import { fetchOperationalSettings } from "@/lib/admin/salon-queries";
import { resolveOperationalFxFromSettings } from "@/lib/admin/pricing-engine";
import { logSalonAdminSupabaseFailure } from "@/lib/admin/admin-supabase-debug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InventoryImportPreviewResult =
  | { ok: true; report: InventoryImportPreviewReport }
  | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024;

function requireImportAdmin(ctx: Awaited<ReturnType<typeof getAdminContext>>): string | null {
  const deny = requireManagerOrAbove(ctx);
  if (deny && !deny.ok) return deny.error;
  return null;
}

/**
 * Phase 1 only — parse & audit workbook. Does NOT write to inventory tables.
 */
export async function parseInventoryWorkbookPreviewAction(formData: FormData): Promise<InventoryImportPreviewResult> {
  const ctx = await getAdminContext();
  const deny = requireImportAdmin(ctx);
  if (deny) return { ok: false, error: deny };

  const file = formData.get("workbook");
  if (!(file instanceof File)) return { ok: false, error: "missing_file" };
  if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
    return { ok: false, error: "invalid_file_type" };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "file_too_large" };

  const buffer = await file.arrayBuffer();

  let fx = resolveOperationalFxFromSettings(null);
  try {
    const supabase = await createSupabaseServerClient();
    const settings = await fetchOperationalSettings(supabase);
    fx = resolveOperationalFxFromSettings(settings);
  } catch (e) {
    logSalonAdminSupabaseFailure("action:parseInventoryWorkbookPreviewAction:operational_settings", e, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    /* env fallbacks */
  }

  try {
    const report = parseInventoryWorkbookBuffer(buffer, file.name, fx, "catalog");
    return { ok: true, report };
  } catch (e) {
    logSalonAdminSupabaseFailure("action:parseInventoryWorkbookPreviewAction:parse", e, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
      filename: file.name,
      fileSize: file.size,
    });
    return { ok: false, error: e instanceof Error ? e.message : "parse_failed" };
  }
}
