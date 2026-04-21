import { escapeHtml } from "@/lib/email/escape-html";
import { emailDocument } from "@/lib/email/templates/html-layout";
import type { BookingEmailContext } from "@/lib/email/templates/booking-types";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export function bookingCustomerSubject(ctx: BookingEmailContext): string {
  return `You’re booked · ${ctx.serviceName} at ${SITE_NAME}`;
}

export function bookingCustomerText(ctx: BookingEmailContext): string {
  return [
    `Hi ${ctx.customerName},`,
    "",
    `Thanks for booking with ${SITE_NAME}. Here are your details:`,
    "",
    `Service: ${ctx.serviceName}`,
    `Stylist: ${ctx.stylistName}`,
    `When: ${ctx.scheduleSummary}`,
    "",
    "If you need to change your appointment, reply to this email or contact us:",
    CONTACT_EMAIL,
    "",
    `Reference: ${ctx.bookingId}`,
  ].join("\n");
}

export function bookingCustomerHtml(ctx: BookingEmailContext): string {
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;letter-spacing:-0.02em;">You’re booked</h1>
    <p style="margin:0 0 16px 0;color:#5c5348;">Hi ${escapeHtml(ctx.customerName)}, thanks for choosing ${escapeHtml(SITE_NAME)}.</p>
    <p style="margin:0;padding:12px 14px;background:rgba(184,146,90,0.12);border-radius:8px;font-size:14px;">
      <strong>${escapeHtml(ctx.serviceName)}</strong><br/>
      ${escapeHtml(ctx.stylistName)}<br/>
      <span style="display:block;margin-top:8px;">${escapeHtml(ctx.scheduleSummary)}</span>
    </p>
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.55;">
      Questions or changes? Email us at
      <a href="mailto:${escapeHtml(CONTACT_EMAIL)}" style="color:#6b4f2a;">${escapeHtml(CONTACT_EMAIL)}</a>.
    </p>
    <p style="margin:16px 0 0 0;font-size:12px;color:#7a7268;">Reference: <code style="font-size:12px;">${escapeHtml(ctx.bookingId)}</code></p>
  `;
  return emailDocument(bookingCustomerSubject(ctx), body);
}
