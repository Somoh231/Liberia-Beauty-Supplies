"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { requireManagerOrAbove } from "@/lib/auth/admin-guards";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";
import { normalizeCurrency, parseMoneyToCents, type SalonCurrency } from "@/lib/admin/salon-format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function revalidateSpaceLease() {
  revalidatePath("/admin");
  revalidatePath("/admin/sales-log");
}

function parseWeekDates(start: string, end: string): { ok: true; start: string; end: string } | { ok: false; error: string } {
  const s = start?.trim() ?? "";
  const e = end?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return { ok: false, error: "invalid_week_dates" };
  }
  if (e < s) return { ok: false, error: "invalid_week_range" };
  return { ok: true, start: s, end: e };
}

export async function createSpaceLeasePaymentAction(input: {
  stylistName: string;
  weekStartDate: string;
  weekEndDate: string;
  amount: string;
  currency: SalonCurrency;
  notes?: string | null;
}): Promise<SalonActionResult & { id?: string }> {
  const ctx = await getAdminContext();
  const deny = requireManagerOrAbove(ctx);
  if (deny) return deny;

  const stylistName = input.stylistName?.trim() ?? "";
  if (stylistName.length < 2) return { ok: false, error: "invalid_stylist_name" };

  const dates = parseWeekDates(input.weekStartDate, input.weekEndDate);
  if (!dates.ok) return { ok: false, error: dates.error };

  const amountCents = parseMoneyToCents(input.amount);
  if (amountCents == null) return { ok: false, error: "invalid_amount" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("space_lease_payments")
    .insert({
      stylist_name: stylistName,
      week_start_date: dates.start,
      week_end_date: dates.end,
      amount_cents: amountCents,
      currency: normalizeCurrency(input.currency),
      notes: input.notes?.trim() || null,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  revalidateSpaceLease();
  return { ok: true, id: (data as { id: string } | null)?.id };
}

export async function updateSpaceLeasePaymentAction(input: {
  id: string;
  stylistName: string;
  weekStartDate: string;
  weekEndDate: string;
  amount: string;
  currency: SalonCurrency;
  notes?: string | null;
}): Promise<SalonActionResult> {
  if (!isUuid(input.id)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  const deny = requireManagerOrAbove(ctx);
  if (deny) return deny;

  const stylistName = input.stylistName?.trim() ?? "";
  if (stylistName.length < 2) return { ok: false, error: "invalid_stylist_name" };

  const dates = parseWeekDates(input.weekStartDate, input.weekEndDate);
  if (!dates.ok) return { ok: false, error: dates.error };

  const amountCents = parseMoneyToCents(input.amount);
  if (amountCents == null) return { ok: false, error: "invalid_amount" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("space_lease_payments")
    .update({
      stylist_name: stylistName,
      week_start_date: dates.start,
      week_end_date: dates.end,
      amount_cents: amountCents,
      currency: normalizeCurrency(input.currency),
      notes: input.notes?.trim() || null,
      updated_by: user?.id ?? null,
    })
    .eq("id", input.id);

  if (error) return { ok: false, error: error.message };
  revalidateSpaceLease();
  return { ok: true };
}

export async function deleteSpaceLeasePaymentAction(input: { id: string }): Promise<SalonActionResult> {
  if (!isUuid(input.id)) return { ok: false, error: "invalid_id" };
  const ctx = await getAdminContext();
  const deny = requireManagerOrAbove(ctx);
  if (deny) return deny;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("space_lease_payments").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateSpaceLease();
  return { ok: true };
}
