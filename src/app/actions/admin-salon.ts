"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { normalizeCurrency, parseMoneyToCents, parseQty, type SalonCurrency } from "@/lib/admin/salon-format";
import { fetchInventoryItem } from "@/lib/admin/salon-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export type SalonActionResult = { ok: true } | { ok: false; error: string };

function revalidateSalon() {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/purchases");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/services");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/sales-log");
}

export async function createSupplierAction(input: {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  countryOrigin?: string | null;
  notes?: string | null;
}): Promise<SalonActionResult & { id?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const name = input.name?.trim() ?? "";
  if (name.length < 2) return { ok: false, error: "invalid_name" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name,
      contact_name: input.contactName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      country_origin: (input.countryOrigin?.trim() || "Nigeria").slice(0, 64),
      notes: input.notes?.trim() || null,
      active: true,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const id = (data as { id: string } | null)?.id;
  revalidateSalon();
  return { ok: true, id };
}

export async function createInventoryItemAction(input: {
  productName: string;
  sku?: string | null;
  unit?: string | null;
  supplierId?: string | null;
  category?: string | null;
  notes?: string | null;
  openingQty?: string | null;
  reorderLevel: string;
  lowStockThreshold: string;
  avgUnitCost: string;
  costCurrency: SalonCurrency;
  sellingPrice?: string | null;
  sellingPriceCurrency?: SalonCurrency;
}): Promise<SalonActionResult & { id?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const productName = input.productName?.trim() ?? "";
  if (productName.length < 2) return { ok: false, error: "invalid_name" };
  if (input.supplierId && !isUuid(input.supplierId)) return { ok: false, error: "invalid_supplier" };

  const rl = parseQty(input.reorderLevel);
  const lt = parseQty(input.lowStockThreshold);
  if (rl == null || rl < 0) return { ok: false, error: "invalid_reorder_level" };
  if (lt == null || lt < 0) return { ok: false, error: "invalid_low_threshold" };
  const cost = parseMoneyToCents(input.avgUnitCost);
  if (cost == null) return { ok: false, error: "invalid_cost" };
  const cc = normalizeCurrency(input.costCurrency);
  const defPrice = input.sellingPrice ? parseMoneyToCents(input.sellingPrice) : null;
  const pc = normalizeCurrency(input.sellingPriceCurrency ?? cc);
  const openQ = input.openingQty != null && input.openingQty !== "" ? parseQty(input.openingQty) : 0;
  if (openQ == null || openQ < 0) return { ok: false, error: "invalid_opening_qty" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      product_name: productName,
      name: productName,
      sku: input.sku?.trim() || null,
      unit: (input.unit?.trim() || "each").slice(0, 32),
      supplier_id: input.supplierId && isUuid(input.supplierId) ? input.supplierId : null,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      reorder_level: rl,
      reorder_point: rl,
      low_stock_threshold: lt,
      quantity_on_hand: openQ ?? 0,
      avg_unit_cost_cents: cost,
      cost_currency: cc,
      default_unit_price_cents: defPrice,
      default_price_currency: pc,
      active: true,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "sku_or_code_conflict" };
    return { ok: false, error: error.message };
  }
  const id = (data as { id: string } | null)?.id;
  revalidateSalon();
  return { ok: true, id };
}

export async function updateInventoryItemAction(input: {
  id: string;
  productName: string;
  sku?: string | null;
  unit?: string | null;
  supplierId?: string | null;
  category?: string | null;
  notes?: string | null;
  reorderLevel: string;
  lowStockThreshold: string;
  quantityOnHand: string;
  avgUnitCost: string;
  costCurrency: SalonCurrency;
  sellingPrice?: string | null;
  sellingPriceCurrency?: SalonCurrency;
  active: boolean;
}): Promise<SalonActionResult> {
  if (!isUuid(input.id)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const productName = input.productName?.trim() ?? "";
  if (productName.length < 2) return { ok: false, error: "invalid_name" };

  const rl = parseQty(input.reorderLevel);
  const lt = parseQty(input.lowStockThreshold);
  const qoh = parseQty(input.quantityOnHand);
  if (rl == null || rl < 0) return { ok: false, error: "invalid_reorder_level" };
  if (lt == null || lt < 0) return { ok: false, error: "invalid_low_threshold" };
  if (qoh == null || qoh < 0) return { ok: false, error: "invalid_quantity" };
  const cost = parseMoneyToCents(input.avgUnitCost);
  if (cost == null) return { ok: false, error: "invalid_cost" };
  const cc = normalizeCurrency(input.costCurrency);
  const defPrice = input.sellingPrice ? parseMoneyToCents(input.sellingPrice) : null;
  const pc = normalizeCurrency(input.sellingPriceCurrency ?? cc);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("inventory_items")
    .update({
      product_name: productName,
      name: productName,
      sku: input.sku?.trim() || null,
      unit: (input.unit?.trim() || "each").slice(0, 32),
      supplier_id: input.supplierId && isUuid(input.supplierId) ? input.supplierId : null,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      reorder_level: rl,
      reorder_point: rl,
      low_stock_threshold: lt,
      quantity_on_hand: qoh,
      avg_unit_cost_cents: cost,
      cost_currency: cc,
      default_unit_price_cents: defPrice,
      default_price_currency: pc,
      active: input.active,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };
  revalidateSalon();
  return { ok: true };
}

export async function createProductSaleAction(input: {
  inventoryItemId: string;
  qty: string;
  unitPrice: string;
  currency: SalonCurrency;
  paymentMethod?: string | null;
  notes?: string | null;
}): Promise<SalonActionResult> {
  if (!isUuid(input.inventoryItemId)) return { ok: false, error: "invalid_item" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };

  const qty = parseQty(input.qty);
  if (qty == null || qty <= 0) return { ok: false, error: "invalid_qty" };
  const unitPrice = parseMoneyToCents(input.unitPrice);
  if (unitPrice == null) return { ok: false, error: "invalid_price" };
  const cur = normalizeCurrency(input.currency);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const item = await fetchInventoryItem(supabase, input.inventoryItemId);
  if (!item) return { ok: false, error: "not_found" };
  if (item.cost_currency !== cur) {
    return { ok: false, error: `sale_currency_must_match_stock_cost_${item.cost_currency}` };
  }

  const { error } = await supabase.from("sales").insert({
    inventory_item_id: input.inventoryItemId,
    qty,
    unit_price_cents: unitPrice,
    unit_cost_cents: item.avg_unit_cost_cents,
    currency: cur,
    payment_method: input.paymentMethod?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    if (error.message.includes("insufficient_stock") || error.code === "P0001") {
      return { ok: false, error: "insufficient_stock" };
    }
    return { ok: false, error: error.message };
  }
  revalidateSalon();
  return { ok: true };
}

export type ProductUsageLine = { inventory_item_id: string; qty: number };

export async function createServiceLogAction(input: {
  serviceName: string;
  revenue: string;
  currency: SalonCurrency;
  staffName?: string | null;
  clientNote?: string | null;
  productUsage: ProductUsageLine[];
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const serviceName = input.serviceName?.trim() ?? "";
  if (serviceName.length < 2) return { ok: false, error: "invalid_name" };
  const rev = parseMoneyToCents(input.revenue);
  if (rev == null) return { ok: false, error: "invalid_revenue" };
  const cur = normalizeCurrency(input.currency);

  for (const u of input.productUsage) {
    if (!isUuid(u.inventory_item_id)) return { ok: false, error: "invalid_usage" };
    if (!Number.isFinite(u.qty) || u.qty <= 0) return { ok: false, error: "invalid_usage_qty" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("service_logs").insert({
    service_name: serviceName,
    revenue_cents: rev,
    currency: cur,
    staff_name: input.staffName?.trim() || null,
    client_note: input.clientNote?.trim() || null,
    product_usage: input.productUsage,
    created_by: user?.id ?? null,
  });

  if (error) {
    if (error.message.includes("insufficient_stock") || error.code === "P0001") {
      return { ok: false, error: "insufficient_stock" };
    }
    return { ok: false, error: error.message };
  }
  revalidateSalon();
  return { ok: true };
}

export type PurchaseLineInput = {
  inventoryItemId: string;
  qty: string;
  unitCost: string;
};

export async function createPurchaseAction(input: {
  supplierId: string;
  purchaseDate: string;
  currency: SalonCurrency;
  notes?: string | null;
  shippingReference?: string | null;
  lines: PurchaseLineInput[];
  markReceived: boolean;
}): Promise<SalonActionResult & { purchaseId?: string }> {
  if (!isUuid(input.supplierId)) return { ok: false, error: "invalid_supplier" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const d = input.purchaseDate?.trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "invalid_date" };
  if (!input.lines.length) return { ok: false, error: "no_lines" };

  const cur = normalizeCurrency(input.currency);
  const lines: { inventory_item_id: string; qty: number; unit_cost_cents: number }[] = [];
  for (const ln of input.lines) {
    if (!isUuid(ln.inventoryItemId)) return { ok: false, error: "invalid_line" };
    const q = parseQty(ln.qty);
    const uc = parseMoneyToCents(ln.unitCost);
    if (q == null || q <= 0) return { ok: false, error: "invalid_qty" };
    if (uc == null) return { ok: false, error: "invalid_cost" };
    lines.push({ inventory_item_id: ln.inventoryItemId, qty: q, unit_cost_cents: uc });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pRow, error: pErr } = await supabase
    .from("purchases")
    .insert({
      supplier_id: input.supplierId,
      purchase_date: d,
      currency: cur,
      status: "draft",
      notes: input.notes?.trim() || null,
      shipping_reference: input.shippingReference?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (pErr || !pRow) return { ok: false, error: pErr?.message ?? "create_failed" };
  const purchaseId = (pRow as { id: string }).id;

  const { error: lErr } = await supabase.from("purchase_lines").insert(
    lines.map((l) => ({
      purchase_id: purchaseId,
      inventory_item_id: l.inventory_item_id,
      qty: l.qty,
      unit_cost_cents: l.unit_cost_cents,
    })),
  );
  if (lErr) {
    await supabase.from("purchases").delete().eq("id", purchaseId);
    return { ok: false, error: lErr.message };
  }

  if (input.markReceived) {
    const { error: uErr } = await supabase.from("purchases").update({ status: "received" }).eq("id", purchaseId);
    if (uErr) return { ok: false, error: uErr.message };
  }

  revalidateSalon();
  return { ok: true, purchaseId };
}

export async function receivePurchaseAction(input: { purchaseId: string }): Promise<SalonActionResult> {
  if (!isUuid(input.purchaseId)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("purchases").update({ status: "received" }).eq("id", input.purchaseId);
  if (error) return { ok: false, error: error.message };
  revalidateSalon();
  return { ok: true };
}
