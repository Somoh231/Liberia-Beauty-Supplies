"use server";

import { getAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";
import { normalizeCurrency, parseMoneyToCents, parseQty, type SalonCurrency } from "@/lib/admin/salon-format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export type WeeklyLogResult = { ok: true } | { ok: false; error: string };

function revalidate(reportId?: string) {
  revalidatePath("/admin/sales-log");
  if (reportId) revalidatePath(`/admin/sales-log/${reportId}`);
}

export async function createWeeklyReportAction(input: {
  startDate: string;
  endDate: string;
  staffOnDuty?: string | null;
}): Promise<WeeklyLogResult & { id?: string }> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (isSalonStaffRole(ctx.roleSlug)) return { ok: false, error: "forbidden_staff_role" };
  const sd = input.startDate?.trim();
  const ed = input.endDate?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return { ok: false, error: "invalid_date" };
  if (ed < sd) return { ok: false, error: "end_before_start" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("weekly_sales_reports")
    .insert({
      start_date: sd,
      end_date: ed,
      staff_on_duty: input.staffOnDuty?.trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const id = (data as { id: string } | null)?.id;
  revalidate(id);
  return { ok: true, id };
}

export async function updateWeeklyReportHeaderAction(input: {
  id: string;
  startDate: string;
  endDate: string;
  staffOnDuty?: string | null;
}): Promise<WeeklyLogResult> {
  if (!isUuid(input.id)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (isSalonStaffRole(ctx.roleSlug)) return { ok: false, error: "forbidden_staff_role" };
  const sd = input.startDate?.trim();
  const ed = input.endDate?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return { ok: false, error: "invalid_date" };
  if (ed < sd) return { ok: false, error: "end_before_start" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("weekly_sales_reports")
    .update({
      start_date: sd,
      end_date: ed,
      staff_on_duty: input.staffOnDuty?.trim() || null,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };
  revalidate(input.id);
  return { ok: true };
}

export async function addWeeklyProductSaleAction(input: {
  reportId: string;
  dayDate: string;
  inventoryItemId: string;
  qtySold: string;
  unitPriceMajor: string;
  paymentMethod?: string | null;
  staffName?: string | null;
  currency?: SalonCurrency;
}): Promise<WeeklyLogResult> {
  if (!isUuid(input.reportId) || !isUuid(input.inventoryItemId)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (isSalonStaffRole(ctx.roleSlug)) return { ok: false, error: "forbidden_staff_role" };
  const d = input.dayDate?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "invalid_day" };
  const qty = parseQty(input.qtySold);
  const up = parseMoneyToCents(input.unitPriceMajor);
  if (qty == null || qty <= 0) return { ok: false, error: "invalid_qty" };
  if (up == null) return { ok: false, error: "invalid_price" };
  const lineTotal = Math.round(qty * up);
  const cur = normalizeCurrency(input.currency ?? "NGN");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("weekly_product_sales").insert({
    report_id: input.reportId,
    day_date: d,
    inventory_item_id: input.inventoryItemId,
    qty_sold: qty,
    unit_price_minor: up,
    line_total_minor: lineTotal,
    currency: cur,
    payment_method: input.paymentMethod?.trim() || null,
    staff_name: input.staffName?.trim() || null,
  });

  if (error) {
    if (error.message.includes("insufficient_stock") || error.code === "P0001") {
      return { ok: false, error: "insufficient_stock" };
    }
    return { ok: false, error: error.message };
  }
  revalidate(input.reportId);
  return { ok: true };
}

export async function addWeeklyServiceSaleAction(input: {
  reportId: string;
  dayDate: string;
  serviceName: string;
  stylistName?: string | null;
  clientName?: string | null;
  amountMajor: string;
  paymentMethod?: string | null;
  notes?: string | null;
  currency?: SalonCurrency;
}): Promise<WeeklyLogResult> {
  if (!isUuid(input.reportId)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (isSalonStaffRole(ctx.roleSlug)) return { ok: false, error: "forbidden_staff_role" };
  const d = input.dayDate?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "invalid_day" };
  const name = input.serviceName?.trim() ?? "";
  if (name.length < 2) return { ok: false, error: "invalid_service" };
  const amt = parseMoneyToCents(input.amountMajor);
  if (amt == null) return { ok: false, error: "invalid_amount" };
  const cur = normalizeCurrency(input.currency ?? "NGN");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("weekly_service_sales").insert({
    report_id: input.reportId,
    day_date: d,
    service_name: name,
    stylist_name: input.stylistName?.trim() || null,
    client_name: input.clientName?.trim() || null,
    amount_minor: amt,
    currency: cur,
    payment_method: input.paymentMethod?.trim() || null,
    notes: input.notes?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidate(input.reportId);
  return { ok: true };
}

export async function addWeeklySpacePaymentAction(input: {
  reportId: string;
  stylistName: string;
  spaceNumber?: string | null;
  weekPeriod?: string | null;
  amountPaidMajor: string;
  balanceDueMajor: string;
  paymentMethod?: string | null;
  currency?: SalonCurrency;
}): Promise<WeeklyLogResult> {
  if (!isUuid(input.reportId)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (isSalonStaffRole(ctx.roleSlug)) return { ok: false, error: "forbidden_staff_role" };
  const sn = input.stylistName?.trim() ?? "";
  if (sn.length < 2) return { ok: false, error: "invalid_stylist" };
  const ap = parseMoneyToCents(input.amountPaidMajor) ?? 0;
  const bd = parseMoneyToCents(input.balanceDueMajor) ?? 0;
  const cur = normalizeCurrency(input.currency ?? "NGN");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("weekly_stylist_space_payments").insert({
    report_id: input.reportId,
    stylist_name: sn,
    space_number: input.spaceNumber?.trim() || null,
    week_period: input.weekPeriod?.trim() || null,
    amount_paid_minor: ap,
    balance_due_minor: bd,
    currency: cur,
    payment_method: input.paymentMethod?.trim() || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidate(input.reportId);
  return { ok: true };
}
