"use server";

import type { AdminContext } from "@/lib/auth/admin-context";
import { getAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";
import { normalizeCurrency, parseMoneyToCents, parseQty, type SalonCurrency } from "@/lib/admin/salon-format";
import { effectiveUnitCostUsdCents, lineRevenueUsdEquivCents } from "@/lib/admin/salon-finance";
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
  revalidatePath("/admin/sales/new");
  revalidatePath("/admin/services");
  revalidatePath("/admin/services/new");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/sales-log");
}

function staffForbidden(): SalonActionResult {
  return { ok: false, error: "forbidden_staff_role" };
}

function requireNotStaff(ctx: AdminContext | null): SalonActionResult | null {
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (isSalonStaffRole(ctx.roleSlug)) return staffForbidden();
  return null;
}

function parseFxNgnPerUsd(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function createSupplierAction(input: {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  countryOrigin?: string | null;
  notes?: string | null;
  productCategory?: string | null;
}): Promise<SalonActionResult & { id?: string }> {
  const ctx = await getAdminContext();
  const deny = requireNotStaff(ctx);
  if (deny) return deny;
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
      product_category: input.productCategory?.trim() || null,
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
  fxNgnPerUsd?: string | null;
  landedUsd?: string | null;
  storePriceUsd?: string | null;
  sellPriceUsd?: string | null;
  sellPriceLd?: string | null;
}): Promise<SalonActionResult & { id?: string }> {
  const ctx = await getAdminContext();
  const deny = requireNotStaff(ctx);
  if (deny) return deny;
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

  const fx = parseFxNgnPerUsd(input.fxNgnPerUsd);
  const landed = input.landedUsd != null && input.landedUsd !== "" ? parseMoneyToCents(input.landedUsd) : 0;
  if (landed == null || landed < 0) return { ok: false, error: "invalid_landed" };
  const storeUsd = input.storePriceUsd != null && input.storePriceUsd !== "" ? parseMoneyToCents(input.storePriceUsd) : null;
  const sellUsd = input.sellPriceUsd != null && input.sellPriceUsd !== "" ? parseMoneyToCents(input.sellPriceUsd) : null;
  const sellLd = input.sellPriceLd != null && input.sellPriceLd !== "" ? parseMoneyToCents(input.sellPriceLd) : null;

  const defaultUnit = sellUsd != null ? sellUsd : defPrice;
  const defaultCur = sellUsd != null ? ("USD" as SalonCurrency) : pc;

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
      default_unit_price_cents: defaultUnit ?? defPrice,
      default_price_currency: defaultUnit != null ? defaultCur : pc,
      fx_ngn_per_usd: fx,
      landed_usd_cents_per_unit: landed ?? 0,
      store_price_usd_cents: storeUsd,
      sell_price_usd_cents: sellUsd,
      sell_price_lrd_cents: sellLd,
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
  fxNgnPerUsd?: string | null;
  landedUsd?: string | null;
  storePriceUsd?: string | null;
  sellPriceUsd?: string | null;
  sellPriceLd?: string | null;
}): Promise<SalonActionResult> {
  if (!isUuid(input.id)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  const deny = requireNotStaff(ctx);
  if (deny) return deny;
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

  const fx = parseFxNgnPerUsd(input.fxNgnPerUsd);
  const landed = input.landedUsd != null && input.landedUsd !== "" ? parseMoneyToCents(input.landedUsd) : 0;
  if (landed == null || landed < 0) return { ok: false, error: "invalid_landed" };
  const storeUsd = input.storePriceUsd != null && input.storePriceUsd !== "" ? parseMoneyToCents(input.storePriceUsd) : null;
  const sellUsd = input.sellPriceUsd != null && input.sellPriceUsd !== "" ? parseMoneyToCents(input.sellPriceUsd) : null;
  const sellLd = input.sellPriceLd != null && input.sellPriceLd !== "" ? parseMoneyToCents(input.sellPriceLd) : null;

  const defaultUnit = sellUsd != null ? sellUsd : defPrice;
  const defaultCur = sellUsd != null ? ("USD" as SalonCurrency) : pc;

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
      default_unit_price_cents: defaultUnit ?? defPrice,
      default_price_currency: defaultUnit != null ? defaultCur : pc,
      fx_ngn_per_usd: fx,
      landed_usd_cents_per_unit: landed ?? 0,
      store_price_usd_cents: storeUsd,
      sell_price_usd_cents: sellUsd,
      sell_price_lrd_cents: sellLd,
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
  customerName?: string | null;
  saleDate?: string | null;
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

  const soldAt =
    input.saleDate && /^\d{4}-\d{2}-\d{2}$/.test(input.saleDate.trim())
      ? `${input.saleDate.trim()}T12:00:00.000Z`
      : new Date().toISOString();

  const revUsd = lineRevenueUsdEquivCents(unitPrice, qty, cur);
  const costUsdUnit = effectiveUnitCostUsdCents(item);
  const gpUsd = Math.round(revUsd - qty * costUsdUnit);
  const costSnapshot = item.avg_unit_cost_cents;

  const { error } = await supabase.from("sales").insert({
    inventory_item_id: input.inventoryItemId,
    qty,
    unit_price_cents: unitPrice,
    unit_cost_cents: costSnapshot,
    currency: cur,
    sold_at: soldAt,
    payment_method: input.paymentMethod?.trim() || null,
    notes: input.notes?.trim() || null,
    customer_name: input.customerName?.trim() || null,
    revenue_usd_equiv_cents: revUsd,
    gross_profit_usd_cents: gpUsd,
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

export type RetailSaleLineInput = {
  inventoryItemId: string;
  qty: string;
  unitPrice: string;
  currency: SalonCurrency;
  customerName?: string | null;
  notes?: string | null;
};

export async function createRetailSalesBatchAction(input: {
  saleDate: string;
  lines: RetailSaleLineInput[];
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const d = input.saleDate?.trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "invalid_date" };

  const activeLines = input.lines.filter((ln) => ln.inventoryItemId && ln.qty && ln.unitPrice);
  if (!activeLines.length) return { ok: false, error: "no_lines" };

  for (const ln of activeLines) {
    const r = await createProductSaleAction({
      inventoryItemId: ln.inventoryItemId,
      qty: ln.qty,
      unitPrice: ln.unitPrice,
      currency: ln.currency,
      customerName: ln.customerName,
      notes: ln.notes,
      saleDate: d,
    });
    if (!r.ok) return r;
  }
  return { ok: true };
}

export type ProductUsageLine = { inventory_item_id: string; qty: number };

export async function createServiceLogAction(input: {
  serviceName: string;
  serviceCategory?: string | null;
  revenue: string;
  currency: SalonCurrency;
  staffName?: string | null;
  clientNote?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerFacebook?: string | null;
  productUsage: ProductUsageLine[];
  serviceDate?: string | null;
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

  const soldAt =
    input.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate.trim())
      ? `${input.serviceDate.trim()}T12:00:00.000Z`
      : new Date().toISOString();

  const revUsd = lineRevenueUsdEquivCents(rev, 1, cur);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("service_logs").insert({
    service_name: serviceName,
    service_category: input.serviceCategory?.trim() || null,
    revenue_cents: rev,
    currency: cur,
    sold_at: soldAt,
    staff_name: input.staffName?.trim() || null,
    client_note: input.clientNote?.trim() || null,
    customer_name: input.customerName?.trim() || null,
    customer_phone: input.customerPhone?.trim() || null,
    customer_facebook: input.customerFacebook?.trim() || null,
    product_usage: input.productUsage,
    revenue_usd_equiv_cents: revUsd,
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

export type ServiceLogLineInput = {
  serviceCategory: string;
  revenue: string;
  currency: SalonCurrency;
  staffName?: string | null;
  notes?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerFacebook?: string | null;
};

export async function createServiceLogsBatchAction(input: {
  serviceDate: string;
  lines: ServiceLogLineInput[];
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const d = input.serviceDate?.trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "invalid_date" };

  const active = input.lines.filter((ln) => ln.serviceCategory && ln.revenue);
  if (!active.length) return { ok: false, error: "no_lines" };

  for (const ln of active) {
    const name =
      ln.serviceCategory === "Others" && ln.notes?.trim()
        ? `Others — ${ln.notes.trim()}`
        : ln.serviceCategory;
    const r = await createServiceLogAction({
      serviceName: name,
      serviceCategory: ln.serviceCategory,
      revenue: ln.revenue,
      currency: ln.currency,
      staffName: ln.staffName,
      clientNote: ln.notes,
      customerName: ln.customerName,
      customerPhone: ln.customerPhone,
      customerFacebook: ln.customerFacebook,
      productUsage: [],
      serviceDate: d,
    });
    if (!r.ok) return r;
  }
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
  fxNgnPerUsd?: string | null;
  shippingLandedUsd?: string | null;
  lines: PurchaseLineInput[];
  markReceived: boolean;
}): Promise<SalonActionResult & { purchaseId?: string }> {
  if (!isUuid(input.supplierId)) return { ok: false, error: "invalid_supplier" };
  const ctx = await getAdminContext();
  const deny = requireNotStaff(ctx);
  if (deny) return deny;
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

  const fx = parseFxNgnPerUsd(input.fxNgnPerUsd);
  const shipUsd =
    input.shippingLandedUsd != null && input.shippingLandedUsd !== ""
      ? parseMoneyToCents(input.shippingLandedUsd)
      : 0;
  if (shipUsd == null || shipUsd < 0) return { ok: false, error: "invalid_shipping" };

  const { data: pRow, error: pErr } = await supabase
    .from("purchases")
    .insert({
      supplier_id: input.supplierId,
      purchase_date: d,
      currency: cur,
      status: "draft",
      notes: input.notes?.trim() || null,
      shipping_reference: input.shippingReference?.trim() || null,
      fx_ngn_per_usd: fx,
      shipping_landed_usd_cents: shipUsd ?? 0,
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
  const deny = requireNotStaff(ctx);
  if (deny) return deny;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("purchases").update({ status: "received" }).eq("id", input.purchaseId);
  if (error) return { ok: false, error: error.message };
  revalidateSalon();
  return { ok: true };
}
