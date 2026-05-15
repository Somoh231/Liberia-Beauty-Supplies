import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonroviaDayKey, type SalonCurrency, type StockStatus } from "@/lib/admin/salon-format";
import { effectiveUnitCostUsdCents, inventoryValueUsdCents, lineRevenueUsdEquivCents, unitGrossMarginPct } from "@/lib/admin/salon-finance";

const INV_SELECT =
  "id,product_code,product_name,name,quantity_on_hand,reorder_point,reorder_level,low_stock_threshold,stock_status,avg_unit_cost_cents,total_stock_value_minor,cost_currency,default_unit_price_cents,default_price_currency,category,supplier_id,notes,unit,sku,active,deleted_at,created_at,updated_at,fx_ngn_per_usd,landed_usd_cents_per_unit,store_price_usd_cents,sell_price_usd_cents,sell_price_lrd_cents,weighted_avg_landed_usd_cents";

export type SupplierRow = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  country_origin: string;
  product_category: string | null;
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
  fx_ngn_per_usd?: number | null;
  landed_usd_cents_per_unit?: number;
  store_price_usd_cents?: number | null;
  sell_price_usd_cents?: number | null;
  sell_price_lrd_cents?: number | null;
  weighted_avg_landed_usd_cents?: number;
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
  customer_name: string | null;
  revenue_usd_equiv_cents: number | null;
  gross_profit_usd_cents: number | null;
};

export type ServiceLogRow = {
  id: string;
  service_name: string;
  revenue_cents: number;
  currency: SalonCurrency;
  sold_at: string;
  staff_name: string | null;
  service_category: string | null;
  revenue_usd_equiv_cents: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_facebook: string | null;
  client_note: string | null;
};

const SERVICE_LOG_SELECT =
  "id,service_name,revenue_cents,currency,sold_at,staff_name,service_category,revenue_usd_equiv_cents,customer_name,customer_phone,customer_facebook,client_note";

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
    .select("id,name,contact_name,email,phone,country_origin,product_category,active")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

export async function fetchAllSuppliersAdmin(supabase: SupabaseClient): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name,contact_name,email,phone,country_origin,product_category,active")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierRow[];
}

export type InventoryListFilters = {
  q?: string;
  status?: StockStatus | "all";
};

export type InventoryPageFilters = InventoryListFilters & {
  page?: number;
  pageSize?: number;
};

export type InventoryPageResult = {
  rows: InventoryProductRow[];
  total: number;
  page: number;
  pageSize: number;
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

export async function fetchInventoryProductsPage(
  supabase: SupabaseClient,
  filters: InventoryPageFilters = {},
): Promise<InventoryPageResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 15));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("inventory_items")
    .select(INV_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("product_code");

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

  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []) as InventoryProductRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
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
    .select(
      "id,inventory_item_id,qty,unit_price_cents,unit_cost_cents,currency,sold_at,payment_method,customer_name,revenue_usd_equiv_cents,gross_profit_usd_cents",
    )
    .gte("sold_at", iso)
    .order("sold_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SaleRow[];
}

export async function fetchServiceLogsSince(supabase: SupabaseClient, iso: string): Promise<ServiceLogRow[]> {
  const { data, error } = await supabase
    .from("service_logs")
    .select(SERVICE_LOG_SELECT)
    .gte("sold_at", iso)
    .order("sold_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceLogRow[];
}

export async function fetchServiceLogHistory(
  supabase: SupabaseClient,
  opts: { search?: string; limit?: number } = {},
): Promise<ServiceLogRow[]> {
  const limit = opts.limit ?? 60;
  const q = opts.search?.trim();
  let query = supabase.from("service_logs").select(SERVICE_LOG_SELECT).order("sold_at", { ascending: false }).limit(limit);

  if (q && q.length >= 2) {
    const safe = q.replace(/,/g, " ").trim();
    const pattern = `%${safe}%`;
    query = query.or(
      [
        `customer_name.ilike.${pattern}`,
        `customer_phone.ilike.${pattern}`,
        `customer_facebook.ilike.${pattern}`,
        `staff_name.ilike.${pattern}`,
        `service_name.ilike.${pattern}`,
        `service_category.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await query;
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
    .select(
      "id,inventory_item_id,qty,unit_price_cents,unit_cost_cents,currency,sold_at,payment_method,customer_name,revenue_usd_equiv_cents,gross_profit_usd_cents",
    )
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
  outOfStockCount: number;
  inventoryValueUsdCents: number;
  /** Legacy: stock book value by recorded cost currency */
  inventoryValueByCurrency: MoneyBag;
  productRevenueUsdByDay: Record<string, number>;
  serviceRevenueUsdByDay: Record<string, number>;
  productGrossProfitUsdByDay: Record<string, number>;
  totalsLast30: {
    productRevenueUsd: number;
    serviceRevenueUsd: number;
    productGrossProfitUsd: number;
  };
};

function monroviaDayKeyFromIso(iso: string): string {
  return getMonroviaDayKey(new Date(iso));
}

function addDayUsd(map: Record<string, number>, day: string, usdMinor: number) {
  map[day] = (map[day] ?? 0) + usdMinor;
}

export async function fetchDashboardRollup(supabase: SupabaseClient): Promise<DashboardRollup> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 62);
  const iso = since.toISOString();

  const [statusSummary, items, sales, services] = await Promise.all([
    fetchInventoryStatusSummary(supabase),
    fetchInventoryProducts(supabase, {}),
    fetchSalesSince(supabase, iso),
    fetchServiceLogsSince(supabase, iso),
  ]);

  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));

  const inventoryValueByCurrency = emptyBag();
  let inventoryValueUsdRollup = 0;
  for (const it of items) {
    if (!it.active || it.deleted_at) continue;
    const v =
      it.total_stock_value_minor != null
        ? it.total_stock_value_minor
        : Math.round(Number(it.quantity_on_hand) * it.avg_unit_cost_cents);
    const c = it.cost_currency;
    inventoryValueByCurrency[c] += v;
    inventoryValueUsdRollup += inventoryValueUsdCents(it);
  }

  const productRevenueUsdByDay: Record<string, number> = {};
  const serviceRevenueUsdByDay: Record<string, number> = {};
  const productGrossProfitUsdByDay: Record<string, number> = {};
  const totalsLast30 = {
    productRevenueUsd: 0,
    serviceRevenueUsd: 0,
    productGrossProfitUsd: 0,
  };

  const cutoff30 = new Date();
  cutoff30.setUTCDate(cutoff30.getUTCDate() - 30);

  for (const s of sales) {
    const day = monroviaDayKeyFromIso(s.sold_at);
    const revUsd =
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency);
    const item = itemById[s.inventory_item_id];
    let gpUsd = s.gross_profit_usd_cents;
    if (gpUsd == null && item) {
      gpUsd = Math.round(revUsd - s.qty * effectiveUnitCostUsdCents(item));
    } else if (gpUsd == null) {
      gpUsd = 0;
    }
    addDayUsd(productRevenueUsdByDay, day, revUsd);
    addDayUsd(productGrossProfitUsdByDay, day, gpUsd);
    if (new Date(s.sold_at) >= cutoff30) {
      totalsLast30.productRevenueUsd += revUsd;
      totalsLast30.productGrossProfitUsd += gpUsd;
    }
  }

  for (const s of services) {
    const day = monroviaDayKeyFromIso(s.sold_at);
    const revUsd = s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency);
    addDayUsd(serviceRevenueUsdByDay, day, revUsd);
    if (new Date(s.sold_at) >= cutoff30) {
      totalsLast30.serviceRevenueUsd += revUsd;
    }
  }

  return {
    lowStockCount: statusSummary.low_stock,
    outOfStockCount: statusSummary.out_of_stock,
    inventoryValueUsdCents: inventoryValueUsdRollup,
    inventoryValueByCurrency,
    productRevenueUsdByDay,
    serviceRevenueUsdByDay,
    productGrossProfitUsdByDay,
    totalsLast30,
  };
}

export type SaleLogDailyRow = {
  day: string;
  retailUsdCents: number;
  serviceUsdCents: number;
  combinedUsdCents: number;
};

export type CurrencyTotals = { USD: number; LRD: number };

export type SaleLogDailyRowWithFx = SaleLogDailyRow & {
  retailNative: CurrencyTotals;
  serviceNative: CurrencyTotals;
};

export type SaleLogAnalytics = {
  dailyUsd: SaleLogDailyRow[];
  weekRetailUsdCents: number;
  weekServiceUsdCents: number;
  monthRetailUsdCents: number;
  monthServiceUsdCents: number;
  ytdRetailUsdCents: number;
  ytdServiceUsdCents: number;
  weekNative: { retail: CurrencyTotals; service: CurrencyTotals };
  monthNative: { retail: CurrencyTotals; service: CurrencyTotals };
  ytdNative: { retail: CurrencyTotals; service: CurrencyTotals };
  topProducts: { name: string; qty: number; revenueUsdCents: number }[];
  topServices: { name: string; count: number; revenueUsdCents: number }[];
};

export type LowStockAlertRow = {
  id: string;
  product_code: string;
  product_name: string;
  quantity_on_hand: number;
  unit: string;
  stock_status: StockStatus | null;
};

export async function fetchLowStockAlerts(supabase: SupabaseClient, limit = 8): Promise<LowStockAlertRow[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,product_code,product_name,quantity_on_hand,unit,stock_status")
    .is("deleted_at", null)
    .eq("active", true)
    .in("stock_status", ["low_stock", "out_of_stock"])
    .order("quantity_on_hand")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LowStockAlertRow[];
}

export type TodayRevenueSnapshot = {
  retailUsdCents: number;
  serviceUsdCents: number;
  retailNative: CurrencyTotals;
  serviceNative: CurrencyTotals;
};

export async function fetchTodayRevenueSnapshot(supabase: SupabaseClient): Promise<TodayRevenueSnapshot> {
  const dayKey = getMonroviaDayKey();
  const start = `${dayKey}T00:00:00.000Z`;
  const end = `${dayKey}T23:59:59.999Z`;

  const [{ data: sales }, { data: services }] = await Promise.all([
    supabase
      .from("sales")
      .select("qty,unit_price_cents,currency,revenue_usd_equiv_cents")
      .gte("sold_at", start)
      .lte("sold_at", end),
    supabase
      .from("service_logs")
      .select("revenue_cents,currency,revenue_usd_equiv_cents")
      .gte("sold_at", start)
      .lte("sold_at", end),
  ]);

  const retailNative: CurrencyTotals = { USD: 0, LRD: 0 };
  const serviceNative: CurrencyTotals = { USD: 0, LRD: 0 };
  let retailUsdCents = 0;
  let serviceUsdCents = 0;

  for (const s of sales ?? []) {
    const row = s as { qty: number; unit_price_cents: number; currency: SalonCurrency; revenue_usd_equiv_cents: number | null };
    const line = Math.round(row.qty * row.unit_price_cents);
    if (row.currency === "USD") retailNative.USD += line;
    else if (row.currency === "LRD") retailNative.LRD += line;
    retailUsdCents += row.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(row.unit_price_cents, row.qty, row.currency);
  }
  for (const s of services ?? []) {
    const row = s as { revenue_cents: number; currency: SalonCurrency; revenue_usd_equiv_cents: number | null };
    if (row.currency === "USD") serviceNative.USD += row.revenue_cents;
    else if (row.currency === "LRD") serviceNative.LRD += row.revenue_cents;
    serviceUsdCents += row.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(row.revenue_cents, 1, row.currency);
  }

  return { retailUsdCents, serviceUsdCents, retailNative, serviceNative };
}

function startOfYearIso(): string {
  const y = new Date().getFullYear();
  return new Date(`${y}-01-01T00:00:00.000Z`).toISOString();
}

export async function fetchSaleLogAnalytics(supabase: SupabaseClient): Promise<SaleLogAnalytics> {
  const iso = startOfYearIso();
  const [{ data: saleRows, error: e1 }, { data: serviceRows, error: e2 }, items] = await Promise.all([
    supabase
      .from("sales")
      .select("inventory_item_id,qty,unit_price_cents,currency,sold_at,revenue_usd_equiv_cents")
      .gte("sold_at", iso),
    supabase
      .from("service_logs")
      .select("service_name,service_category,revenue_cents,currency,sold_at,revenue_usd_equiv_cents")
      .gte("sold_at", iso),
    fetchInventoryProducts(supabase, {}),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const nameById = Object.fromEntries(items.map((i) => [i.id, i.product_name]));

  type SaleLite = {
    inventory_item_id: string;
    qty: number;
    unit_price_cents: number;
    currency: SalonCurrency;
    sold_at: string;
    revenue_usd_equiv_cents: number | null;
  };
  type ServiceLite = {
    service_name: string;
    service_category: string | null;
    revenue_cents: number;
    currency: SalonCurrency;
    sold_at: string;
    revenue_usd_equiv_cents: number | null;
  };

  const sales = (saleRows ?? []) as SaleLite[];
  const services = (serviceRows ?? []) as ServiceLite[];

  const retailByDay: Record<string, number> = {};
  const serviceByDay: Record<string, number> = {};
  const emptyNative = (): CurrencyTotals => ({ USD: 0, LRD: 0 });

  const add = (m: Record<string, number>, day: string, v: number) => {
    m[day] = (m[day] ?? 0) + v;
  };

  const weekNative = { retail: emptyNative(), service: emptyNative() };
  const monthNative = { retail: emptyNative(), service: emptyNative() };
  const ytdNative = { retail: emptyNative(), service: emptyNative() };

  const addNative = (bag: CurrencyTotals, currency: SalonCurrency, minor: number) => {
    if (currency === "USD") bag.USD += minor;
    else if (currency === "LRD") bag.LRD += minor;
  };

  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const monthAgo = now - 30 * 86400000;

  for (const s of sales) {
    const day = monroviaDayKeyFromIso(s.sold_at);
    const line = Math.round(s.qty * s.unit_price_cents);
    const rev =
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency);
    add(retailByDay, day, rev);
    addNative(ytdNative.retail, s.currency, line);
    const t = new Date(s.sold_at).getTime();
    if (t >= weekAgo) addNative(weekNative.retail, s.currency, line);
    if (t >= monthAgo) addNative(monthNative.retail, s.currency, line);
  }
  for (const s of services) {
    const day = monroviaDayKeyFromIso(s.sold_at);
    const rev = s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency);
    add(serviceByDay, day, rev);
    addNative(ytdNative.service, s.currency, s.revenue_cents);
    const t = new Date(s.sold_at).getTime();
    if (t >= weekAgo) addNative(weekNative.service, s.currency, s.revenue_cents);
    if (t >= monthAgo) addNative(monthNative.service, s.currency, s.revenue_cents);
  }

  const allDays = new Set([...Object.keys(retailByDay), ...Object.keys(serviceByDay)]);
  const dailyUsd: SaleLogDailyRow[] = [...allDays]
    .sort()
    .map((day) => {
      const r = retailByDay[day] ?? 0;
      const sv = serviceByDay[day] ?? 0;
      return { day, retailUsdCents: r, serviceUsdCents: sv, combinedUsdCents: r + sv };
    });

  let weekRetailUsdCents = 0;
  let weekServiceUsdCents = 0;
  let monthRetailUsdCents = 0;
  let monthServiceUsdCents = 0;

  for (const s of sales) {
    const t = new Date(s.sold_at).getTime();
    const rev =
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency);
    if (t >= weekAgo) weekRetailUsdCents += rev;
    if (t >= monthAgo) monthRetailUsdCents += rev;
  }
  for (const s of services) {
    const t = new Date(s.sold_at).getTime();
    const rev = s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency);
    if (t >= weekAgo) weekServiceUsdCents += rev;
    if (t >= monthAgo) monthServiceUsdCents += rev;
  }

  const ytdRetailUsdCents = sales.reduce(
    (a, s) => a + (s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency)),
    0,
  );
  const ytdServiceUsdCents = services.reduce(
    (a, s) => a + (s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency)),
    0,
  );

  const prodAgg: Record<string, { qty: number; revenueUsdCents: number }> = {};
  for (const s of sales) {
    const nm = nameById[s.inventory_item_id] ?? "Product";
    const rev =
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency);
    if (!prodAgg[nm]) prodAgg[nm] = { qty: 0, revenueUsdCents: 0 };
    prodAgg[nm].qty += s.qty;
    prodAgg[nm].revenueUsdCents += rev;
  }
  const topProducts = Object.entries(prodAgg)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenueUsdCents - a.revenueUsdCents)
    .slice(0, 8);

  const svcAgg: Record<string, { count: number; revenueUsdCents: number }> = {};
  for (const s of services) {
    const label = (s.service_category ?? "").trim() || s.service_name;
    const rev = s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency);
    if (!svcAgg[label]) svcAgg[label] = { count: 0, revenueUsdCents: 0 };
    svcAgg[label].count += 1;
    svcAgg[label].revenueUsdCents += rev;
  }
  const topServices = Object.entries(svcAgg)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenueUsdCents - a.revenueUsdCents)
    .slice(0, 8);

  return {
    dailyUsd,
    weekRetailUsdCents,
    weekServiceUsdCents,
    monthRetailUsdCents,
    monthServiceUsdCents,
    ytdRetailUsdCents,
    ytdServiceUsdCents,
    weekNative,
    monthNative,
    ytdNative,
    topProducts,
    topServices,
  };
}

export async function fetchSupplierLastRestockMap(supabase: SupabaseClient): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from("purchases")
    .select("supplier_id,received_at")
    .eq("status", "received")
    .not("received_at", "is", null)
    .order("received_at", { ascending: false });
  if (error) throw new Error(error.message);
  const out: Record<string, string | null> = {};
  for (const r of data ?? []) {
    const row = r as { supplier_id: string; received_at: string };
    if (!out[row.supplier_id]) out[row.supplier_id] = row.received_at;
  }
  return out;
}

export type RecentActivityRow =
  | { kind: "sale"; label: string; when: string; amountUsdCents: number }
  | { kind: "service"; label: string; when: string; amountUsdCents: number };

export async function fetchRecentActivity(supabase: SupabaseClient, limit = 12): Promise<RecentActivityRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 14);
  const [sales, services, items] = await Promise.all([
    fetchSalesSince(supabase, since.toISOString()),
    fetchServiceLogsSince(supabase, since.toISOString()),
    fetchInventoryProducts(supabase, {}),
  ]);
  const nameById = Object.fromEntries(items.map((i) => [i.id, i.product_name]));

  const rows: RecentActivityRow[] = [];
  for (const s of sales) {
    const rev =
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency);
    rows.push({
      kind: "sale",
      label: nameById[s.inventory_item_id] ?? "Retail sale",
      when: s.sold_at,
      amountUsdCents: rev,
    });
  }
  for (const s of services) {
    const rev = s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency);
    const client = s.customer_name?.trim();
    const base = s.service_category ?? s.service_name;
    rows.push({
      kind: "service",
      label: client ? `${base} · ${client}` : base,
      when: s.sold_at,
      amountUsdCents: rev,
    });
  }
  rows.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  return rows.slice(0, limit);
}

export type TopMarginProduct = { id: string; name: string; marginPct: number; sellUsdCents: number };

export async function fetchTopMarginProducts(supabase: SupabaseClient, take = 5): Promise<TopMarginProduct[]> {
  const items = await fetchInventoryProducts(supabase, {});
  const ranked = items
    .filter((i) => i.active && !i.deleted_at)
    .map((i) => {
      const m = unitGrossMarginPct(i);
      return m == null
        ? null
        : {
            id: i.id,
            name: i.product_name,
            marginPct: m,
            sellUsdCents: i.sell_price_usd_cents ?? 0,
          };
    })
    .filter((x): x is TopMarginProduct => x != null)
    .sort((a, b) => b.marginPct - a.marginPct);
  return ranked.slice(0, take);
}
