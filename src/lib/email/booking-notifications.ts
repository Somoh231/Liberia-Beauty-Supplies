import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSlotLabel } from "@/lib/booking/availability";
import { BOOKING_TIMEZONE_LABEL } from "@/lib/booking/constants";
import { getSmtpConfig } from "@/lib/email/env";
import { sendSmtpMail } from "@/lib/email/mailer";
import {
  bookingBusinessHtml,
  bookingBusinessSubject,
  bookingBusinessText,
} from "@/lib/email/templates/booking-business";
import {
  bookingCustomerHtml,
  bookingCustomerSubject,
  bookingCustomerText,
} from "@/lib/email/templates/booking-customer-confirmation";
import type { BookingEmailContext } from "@/lib/email/templates/booking-types";

function formatScheduleSummary(startsAtIso: string, endsAtIso: string): string {
  const start = new Date(startsAtIso);
  const day = new Intl.DateTimeFormat("en-LR", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(start);
  const t0 = formatSlotLabel(startsAtIso);
  const t1 = formatSlotLabel(endsAtIso);
  return `${day} · ${t0} – ${t1} (${BOOKING_TIMEZONE_LABEL})`;
}

type BookingRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  services: { name: string } | { name: string }[] | null;
  stylists: { name: string } | { name: string }[] | null;
};

function embedName(v: { name: string } | { name: string }[] | null | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0]?.name ?? null : v.name;
}

/**
 * Loads booking + service/stylist names and sends:
 * 1) Business notification (always when SMTP configured)
 * 2) Customer confirmation (when `BOOKING_CUSTOMER_CONFIRMATION` is truthy)
 *
 * Failures are logged only — booking already persisted.
 */
export async function sendBookingCreatedEmails(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return;
  }

  const { data: raw, error } = await supabase
    .from("bookings")
    .select("id, customer_name, customer_phone, customer_email, starts_at, ends_at, notes, services(name), stylists(name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !raw) {
    console.error("[booking-email] load booking failed:", error?.message ?? "no row");
    return;
  }

  const row = raw as BookingRow;
  const serviceName = embedName(row.services);
  const stylistName = embedName(row.stylists);
  if (!serviceName || !stylistName) {
    console.error("[booking-email] missing service or stylist name for", bookingId);
    return;
  }

  const ctx: BookingEmailContext = {
    bookingId: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    serviceName,
    stylistName,
    startsAtIso: row.starts_at,
    endsAtIso: row.ends_at,
    notes: row.notes,
    scheduleSummary: formatScheduleSummary(row.starts_at, row.ends_at),
  };

  const business = await sendSmtpMail({
    to: cfg.bookingNotifyTo,
    replyTo: ctx.customerEmail,
    subject: bookingBusinessSubject(ctx),
    text: bookingBusinessText(ctx),
    html: bookingBusinessHtml(ctx),
  });
  if (!business.ok) {
    console.error("[booking-email] business notify:", business);
  }

  if (!cfg.sendCustomerConfirmation) {
    return;
  }

  const guest = await sendSmtpMail({
    to: ctx.customerEmail,
    subject: bookingCustomerSubject(ctx),
    text: bookingCustomerText(ctx),
    html: bookingCustomerHtml(ctx),
  });
  if (!guest.ok) {
    console.error("[booking-email] customer confirm:", guest);
  }
}
