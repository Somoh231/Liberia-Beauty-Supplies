import { escapeHtml } from "@/lib/email/escape-html";
import { emailDocument } from "@/lib/email/templates/html-layout";
import type { BookingEmailContext } from "@/lib/email/templates/booking-types";

export function bookingBusinessSubject(ctx: BookingEmailContext): string {
  return `New booking: ${ctx.serviceName} · ${ctx.customerName}`;
}

export function bookingBusinessText(ctx: BookingEmailContext): string {
  const lines = [
    "New booking received",
    "",
    `Service: ${ctx.serviceName}`,
    `Stylist: ${ctx.stylistName}`,
    `When: ${ctx.scheduleSummary}`,
    "",
    `Guest: ${ctx.customerName}`,
    `Email: ${ctx.customerEmail}`,
    `Phone: ${ctx.customerPhone}`,
    "",
    ctx.notes ? `Notes:\n${ctx.notes}` : "Notes: —",
    "",
    `Booking ID: ${ctx.bookingId}`,
  ];
  return lines.join("\n");
}

export function bookingBusinessHtml(ctx: BookingEmailContext): string {
  const n = ctx.notes?.trim();
  const notesBlock = n
    ? `<p style="margin:16px 0 0 0;"><strong>Notes</strong><br/>${escapeHtml(n).replace(/\n/g, "<br/>")}</p>`
    : `<p style="margin:16px 0 0 0;color:#5c5348;"><strong>Notes</strong> —</p>`;

  const body = `
    <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:600;letter-spacing:-0.02em;">New booking</h1>
    <p style="margin:0;color:#5c5348;font-size:14px;">${escapeHtml(ctx.serviceName)} · ${escapeHtml(ctx.stylistName)}</p>
    <p style="margin:16px 0 0 0;padding:12px 14px;background:rgba(184,146,90,0.12);border-radius:8px;font-size:14px;">
      <strong>Schedule</strong><br/>${escapeHtml(ctx.scheduleSummary)}
    </p>
    <p style="margin:16px 0 0 0;"><strong>Guest</strong><br/>
      ${escapeHtml(ctx.customerName)}<br/>
      <a href="mailto:${escapeHtml(ctx.customerEmail)}" style="color:#6b4f2a;">${escapeHtml(ctx.customerEmail)}</a><br/>
      ${escapeHtml(ctx.customerPhone)}
    </p>
    ${notesBlock}
    <p style="margin:20px 0 0 0;font-size:12px;color:#7a7268;">Booking ID: <code style="font-size:12px;">${escapeHtml(ctx.bookingId)}</code></p>
  `;
  return emailDocument(bookingBusinessSubject(ctx), body);
}
