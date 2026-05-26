import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAllSuppliersAdmin,
  fetchInventoryCorrectionLog,
  fetchInventoryItem,
  fetchInventoryMovementsForItem,
  fetchOperationalSettings,
  fetchSalesForItem,
  fetchSupplierLastRestockMap,
  fetchSuppliers,
  type InventoryCorrectionLogRow,
  type InventoryMovementRow,
  type InventoryProductRow,
  type OperationalSettingsRow,
  type SaleRow,
  type SupplierRow,
} from "@/lib/admin/salon-queries";
import { formatOperationalFxSummaryLineFromRates, resolveOperationalFxFromSettings } from "@/lib/admin/pricing-engine";
import { logSalonAdminSupabaseFailure } from "@/lib/admin/admin-supabase-debug";

export type InventoryFormBootstrap = {
  suppliers: SupplierRow[];
  settings: OperationalSettingsRow | null;
  fxSummaryLine: string;
};

/** Shared by /admin/inventory/new and inventory edit forms. Never throws. */
export async function loadInventoryFormBootstrap(
  supabase: SupabaseClient,
  scope: string,
): Promise<InventoryFormBootstrap> {
  let suppliers: SupplierRow[] = [];
  let settings: OperationalSettingsRow | null = null;
  try {
    suppliers = await fetchSuppliers(supabase);
  } catch (err) {
    logSalonAdminSupabaseFailure(`${scope}:fetchSuppliers`, err);
    suppliers = [];
  }
  try {
    settings = await fetchOperationalSettings(supabase);
  } catch (err) {
    logSalonAdminSupabaseFailure(`${scope}:fetchOperationalSettings`, err);
    settings = null;
  }
  const fxSummaryLine = formatOperationalFxSummaryLineFromRates(resolveOperationalFxFromSettings(settings));
  return { suppliers, settings, fxSummaryLine };
}

export function toSupplierOptions(suppliers: SupplierRow[] | null | undefined): { id: string; name: string }[] {
  return (suppliers ?? [])
    .filter((s) => s?.id && s?.name)
    .map((s) => ({ id: s.id, name: s.name }));
}

export type SuppliersAdminPageData = {
  rows: SupplierRow[];
  restock: Record<string, string | null>;
  loadErrors: string[];
};

/** /admin/suppliers — never throws. */
export async function loadSuppliersAdminPage(supabase: SupabaseClient): Promise<SuppliersAdminPageData> {
  const loadErrors: string[] = [];
  let rows: SupplierRow[] = [];
  let restock: Record<string, string | null> = {};
  try {
    rows = await fetchAllSuppliersAdmin(supabase);
  } catch (err) {
    logSalonAdminSupabaseFailure("loadSuppliersAdminPage:fetchAllSuppliersAdmin", err);
    loadErrors.push("suppliers");
    rows = [];
  }
  try {
    restock = await fetchSupplierLastRestockMap(supabase);
  } catch (err) {
    logSalonAdminSupabaseFailure("loadSuppliersAdminPage:fetchSupplierLastRestockMap", err);
    loadErrors.push("purchases_restock_map");
    restock = {};
  }
  return { rows, restock, loadErrors };
}

export type InventoryDetailBootstrap = {
  item: InventoryProductRow | null;
  suppliers: SupplierRow[];
  sales: SaleRow[];
  movements: InventoryMovementRow[];
  corrections: InventoryCorrectionLogRow[];
  settings: OperationalSettingsRow | null;
  fxSummaryLine: string;
  loadErrors: string[];
};

/** /admin/inventory/[id] — item required; auxiliary queries degrade gracefully. */
export async function loadInventoryDetailBootstrap(
  supabase: SupabaseClient,
  itemId: string,
): Promise<InventoryDetailBootstrap> {
  const loadErrors: string[] = [];
  let item: InventoryProductRow | null = null;
  try {
    item = await fetchInventoryItem(supabase, itemId);
  } catch (err) {
    logSalonAdminSupabaseFailure("loadInventoryDetailBootstrap:fetchInventoryItem", err, { itemId });
    loadErrors.push("inventory_item");
  }

  const form = await loadInventoryFormBootstrap(supabase, "loadInventoryDetailBootstrap");

  let sales: SaleRow[] = [];
  let movements: InventoryMovementRow[] = [];
  let corrections: InventoryCorrectionLogRow[] = [];

  if (item) {
    try {
      sales = await fetchSalesForItem(supabase, itemId, 25);
    } catch (err) {
      logSalonAdminSupabaseFailure("loadInventoryDetailBootstrap:fetchSalesForItem", err, { itemId });
      loadErrors.push("sales");
      sales = [];
    }
    try {
      movements = await fetchInventoryMovementsForItem(supabase, itemId, 40);
    } catch (err) {
      logSalonAdminSupabaseFailure("loadInventoryDetailBootstrap:fetchInventoryMovementsForItem", err, { itemId });
      loadErrors.push("inventory_movements");
      movements = [];
    }
    try {
      corrections = await fetchInventoryCorrectionLog(supabase, itemId, 15);
    } catch (err) {
      logSalonAdminSupabaseFailure("loadInventoryDetailBootstrap:fetchInventoryCorrectionLog", err, { itemId });
      loadErrors.push("inventory_correction_log");
      corrections = [];
    }
  }

  return {
    item,
    suppliers: form.suppliers,
    sales,
    movements,
    corrections,
    settings: form.settings,
    fxSummaryLine: form.fxSummaryLine,
    loadErrors,
  };
}
