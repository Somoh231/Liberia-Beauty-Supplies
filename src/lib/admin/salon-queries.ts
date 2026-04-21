import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonroviaDayKey, type SalonCurrency, type StockStatus } from "@/lib/admin/salon-format";

const INV_SELECT =
  "id,product_code,product_name,name,quantity_on_hand,reorder_point,reorder_level,low_stock_threshold,stock_status,avg_unit_cost_cents,total_stock_value_minor,cost_currency,default_unit_price_cents,default_price_currency,category,supplier_id,notes,unit,sku,active,deleted_at,created_at,updated_at";

export type SupplierRow = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  country_origin: string;
  active: boolean;
};

/** Inventory row aligned with DB (post migration). */
export type InventoryProductRow = {
  id: string;
  product_code: string;
  product_name: string;
  name: string;
  quantity_on_hand: number;
  reorder_point: number;
  reorder_level: number;
  low_stock_threshold: number;
  stock_status: StockStatus | null;
  avg_unit_cost_cents: number;
  total_stock_value_minor: number | null;
  cost_currency: SalonCurrency;
  default_unit_price_cents: number | null;
  default_price_currency: SalonCurrency;
  category: string | null;
  supplier_id: string | null;
  notes: string | null;
  unit: string;
  sku: string | null;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** @deprecated use InventoryProductRow */
export type InventoryItemRow = InventoryProductRow;

export type SaleRow = {
  id: string;
  inventory_item_id: string;
  qty: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  currency: SalonCurrency;
  sold_at: string;
  payment_method: string | null;
};

export type ServiceLogRow = {
  id: string;
  service_name: string;
  revenue_cents: number;
  currency: SalonCurrency;
  sold_at: string;
  staff_name: string | null;
};

export type PurchaseRow = {
  id: string;
  supplier_id: string;
  purchase_date: string;
  currency: SalonCurrency;
  status: "draft" | "received";
  notes: string | null;
  shipping_reference: string | null;
  received_at: string | null;
};

export type WeeklySalesReportRow = {
  id: string;
  start_date: string;
  end_date: string;
  staff_on_duty: string | null;
  created_at: string;
};

export type WeeklyProductSaleRow = {
  id: string;
  report_id: string;
  day_date: string;
  inventory_item_id: string;
  qty_sold: number;
  unit_price_minor: number;
  line_total_minor: number;
  currency: SalonCurrency;
  payment_method: string | null;
  staff_name: string | null;
};

export type WeeklyServiceSaleRow = {
  id: string;
  report_id: string;
  day_date: string;
  service_name: string;
  stylist_name: string | null;
  client_name: string | null;
  amount_minor: number;
  currency: SalonCurrency;
  payment_method: string | null;
  notes: string | null;
};

export type WeeklySpacePaymentRow = {
  id: string;
  report_id: string;
  stylist_name: string;
  space_number: string | null;
  week_period: string | null;
  amount_paid_minor: number;
  balance_due_minor: number;
  currency: SalonCurrency;
  payment_method: string | null;
};

export async function fetchSuppliers(supabase: SupabaseClient): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name,contact_name,email,phone,country_origin,active")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

export async function fetchAllSuppliersAdmin(supabase: SupabaseClient): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name,contact_name,email,phone,country_origin,active")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

export type InventoryListFilters = {
  q?: string;
  status?: StockStatus | "all";
};

export async function fetchInventoryProducts(
  supabase: SupabaseClient,
  filters: InventoryListFilters = {},
): Promise<InventoryProductRow[]> {
  let q = supabase.from("inventory_items").select(INV_SELECT).is("deleted_at", null).order("product_code");

  const term = filters.q?.trim();
  if (term) {
    const safe = term.replace(/[,()"\\]/g, " ").trim();
    if (safe.length) {
      const pat = `%${safe.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
      q = q.or(`product_code.ilike."${pat}",product_name.ilike."${pat}",name.ilike."${pat}"`);
    }
  }
  if (filters.status && filters.status !== "all") {
    q = q.eq("stock_status", filters.status);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryProductRow[];
}

/** Legacy alias */
export async function fetchInventoryItems(
  supabase: SupabaseClient,
  filters: InventoryListFilters = {},
): Promise<InventoryProductRow[]> {
  return fetchInventoryProducts(supabase, filters);
}

export async function fetchInventoryItem(supabase: SupabaseClient, id: string): Promise<InventoryProductRow | null> {
  const { data, error } = await supabase.from("inventory_items").select(INV_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InventoryProductRow | null) ?? null;
}

export type InventoryStatusSummary = {
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
};

export async function fetchInventoryStatusSummary(supabase: SupabaseClient): Promise<InventoryStatusSummary> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("stock_status")
    .is("deleted_at", null)
    .eq("active", true);
  if (error) throw new Error(error.message);
  const out: InventoryStatusSummary = { in_stock: 0, low_stock: 0, out_of_stock: 0 };
  for (const r of data ?? []) {
    const s = (r as { stock_status: StockStatus }).stock_status;
    if (s === "in_stock") out.in_stock += 1;
    else if (s === "low_stock") out.low_stock += 1;
    else if (s === "out_of_stock") out.out_of_stock += 1;
  }
  return out;
}

export async function fetchLowStockCount(supabase: SupabaseClient): Promise<number> {
  const s = await fetchInventoryStatusSummary(supabase);
  return s.low_stock;
}

export async function fetchSalesSince(supabase: SupabaseClient, iso: string): Promise<SaleRow[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("id,inventory_item_id,qty,unit_price_cents,unit_cost_cents,currency,sold_at,payment_method")
    .gte("sold_at", iso)
    .order("sold_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SaleRow[];
}

export async function fetchServiceLogsSince(supabase: SupabaseClient, iso: string): Promise<ServiceLogRow[]> {
  const { data, error } = await supabase
    .from("service_logs")
    .select("id,service_name,revenue_cents,currency,sold_at,staff_name")
    .gte("sold_at", iso)
    .order("sold_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceLogRow[];
}

export async function fetchSalesForItem(
  supabase: SupabaseClient,
  inventoryItemId: string,
  limit = 30,
): Promise<SaleRow[]> {
  const { data, error } = await supabase
    .from("sales")
    .select("id,inventory_item_id,qty,unit_price_cents,unit_cost_cents,currency,sold_at,payment_method")
    .eq("inventory_item_id", inventoryItemId)
    .order("sold_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as SaleRow[];
}

export async function fetchPurchases(supabase: SupabaseClient, limit = 40): Promise<PurchaseRow[]> {
  const { data, error } = await supabase
    .from("purchases")
    .select("id,supplier_id,purchase_date,currency,status,notes,shipping_reference,received_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PurchaseRow[];
}

export async function fetchWeeklyReports(supabase: SupabaseClient, limit = 30): Promise<WeeklySalesReportRow[]> {
  const { data, error } = await supabase
    .from("weekly_sales_reports")
    .select("id,start_date,end_date,staff_on_duty,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as WeeklySalesReportRow[];
}

export async function fetchWeeklyReport(
  supabase: SupabaseClient,
  id: string,
): Promise<{
  report: WeeklySalesReportRow | null;
  products: WeeklyProductSaleRow[];
  services: WeeklyServiceSaleRow[];
  spaces: WeeklySpacePaymentRow[];
}> {
  const { data: report, error: e1 } = await supabase
    .from("weekly_sales_reports")
    .select("id,start_date,end_date,staff_on_duty,created_at")
    .eq("id", id)
    .maybeSingle();
  if (e1) throw new Error(e1.message);

  const [{ data: products, error: e2 }, { data: services, error: e3 }, { data: spaces, error: e4 }] =
    await Promise.all([
      supabase
        .from("weekly_product_sales")
        .select(
          "id,report_id,day_date,inventory_item_id,qty_sold,unit_price_minor,line_total_minor,currency,payment_method,staff_name",
        )
        .eq("report_id", id)
        .order("day_date", { ascending: true }),
      supabase
        .from("weekly_service_sales")
        .select(
          "id,report_id,day_date,service_name,stylist_name,client_name,amount_minor,currency,payment_method,notes",
        )
        .eq("report_id", id)
        .order("day_date", { ascending: true }),
      supabase
        .from("weekly_stylist_space_payments")
        .select(
          "id,report_id,stylist_name,space_number,week_period,amount_paid_minor,balance_due_minor,currency,payment_method",
        )
        .eq("report_id", id),
    ]);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  if (e4) throw new Error(e4.message);

  return {
    report: (report as WeeklySalesReportRow | null) ?? null,
    products: (products ?? []) as WeeklyProductSaleRow[],
    services: (services ?? []) as WeeklyServiceSaleRow[],
    spaces: (spaces ?? []) as WeeklySpacePaymentRow[],
  };
}

export type MoneyBag = Record<SalonCurrency, number>;

function emptyBag(): MoneyBag {
  return { USD: 0, LRD: 0, NGN: 0 };
}

export type DashboardRollup = {
  lowStockCount: number;
  inventoryValueByCurrency: MoneyBag;
  productRevenueByDay: Record<string, MoneyBag>;
  serviceRevenueByDay: Record<string, MoneyBag>;
  productGrossProfitByDay: Record<string, MoneyBag>;
  totalsLast30: {
    productRevenue: MoneyBag;
    serviceRevenue: MoneyBag;
    productGrossProfit: MoneyBag;
  };
};

function monroviaDayKeyFromIso(iso: string): string {
  return getMonroviaDayKey(new Date(iso));
}

function addDay(map: Record<string, MoneyBag>, day: string, currency: SalonCurrency, minor: number) {
  if (!map[day]) map[day] = emptyBag();
  map[day][currency] += minor;
}

export async function fetchDashboardRollup(supabase: SupabaseClient): Promise<DashboardRollup> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 62);
  const iso = since.toISOString();

  const [lowStockCount, items, sales, services] = await Promise.all([
    fetchLowStockCount(supabase),
    fetchInventoryProducts(supabase, {}),
    fetchSalesSince(supabase, iso),
    fetchServiceLogsSince(supabase, iso),
  ]);

  const inventoryValueByCurrency = emptyBag();
  for (const it of items) {
    if (!it.active || it.deleted_at) continue;
    const v =
      it.total_stock_value_minor != null
        ? it.total_stock_value_minor
        : Math.round(Number(it.quantity_on_hand) * it.avg_unit_cost_cents);
    const c = it.cost_currency;
    inventoryValueByCurrency[c] += v;
  }

  const productRevenueByDay: DashboardRollup["productRevenueByDay"] = {};
  const serviceRevenueByDay: DashboardRollup["serviceRevenueByDay"] = {};
  const productGrossProfitByDay: DashboardRollup["productGrossProfitByDay"] = {};
  const totalsLast30 = {
    productRevenue: emptyBag(),
    serviceRevenue: emptyBag(),
    productGrossProfit: emptyBag(),
  };

  const cutoff30 = new Date();
  cutoff30.setUTCDate(cutoff30.getUTCDate() - 30);

  for (const s of sales) {
    const day = monroviaDayKeyFromIso(s.sold_at);
    const rev = Math.round(s.qty * s.unit_price_cents);
    const gp = Math.round(s.qty * (s.unit_price_cents - s.unit_cost_cents));
    addDay(productRevenueByDay, day, s.currency, rev);
    addDay(productGrossProfitByDay, day, s.currency, gp);
    if (new Date(s.sold_at) >= cutoff30) {
      totalsLast30.productRevenue[s.currency] += rev;
      totalsLast30.productGrossProfit[s.currency] += gp;
    }
  }

  for (const s of services) {
    const day = monroviaDayKeyFromIso(s.sold_at);
    addDay(serviceRevenueByDay, day, s.currency, s.revenue_cents);
    if (new Date(s.sold_at) >= cutoff30) {
      totalsLast30.serviceRevenue[s.currency] += s.revenue_cents;
    }
  }

  return {
    lowStockCount,
    inventoryValueByCurrency,
    productRevenueByDay,
    serviceRevenueByDay,
    productGrossProfitByDay,
    totalsLast30,
  };
}
