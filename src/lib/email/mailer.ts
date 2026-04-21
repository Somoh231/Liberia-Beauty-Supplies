import "server-only";

import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/email/env";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional Reply-To (e.g. customer email on business notification). */
  replyTo?: string;
};

export type SendMailResult =
  | { ok: true; messageId: string | undefined }
  | { ok: false; reason: "not_configured" | "send_failed"; detail?: string };

export async function sendSmtpMail(input: SendMailInput): Promise<SendMailResult> {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return { ok: false, reason: "not_configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
      tls: {
        minVersion: "TLSv1.2",
      },
    });
    const info = await transporter.sendMail({
      from: cfg.from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[email] send failed:", detail);
    return { ok: false, reason: "send_failed", detail };
  }
}
