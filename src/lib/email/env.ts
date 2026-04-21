import "server-only";

/**
 * SMTP for transactional mail (e.g. GoDaddy / Microsoft 365 relay).
 *
 * GoDaddy Workspace Email (typical):
 * - Host: `smtpout.secureserver.net` (or `smtp.office365.com` if on Microsoft 365)
 * - Port: `465` with SSL (`SMTP_SECURE=true`) or `587` with STARTTLS (`SMTP_SECURE=false`)
 * - User / pass: full email address + mailbox password
 */
export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** From header (should match an allowed sender for your provider). */
  from: string;
  /** Inbox that receives new booking alerts. */
  bookingNotifyTo: string;
  /** When true, also send a confirmation to the guest. */
  sendCustomerConfirmation: boolean;
};

function truthy(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

/** Returns null if SMTP is not configured (booking flow still succeeds). */
export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim() ?? process.env.SMTP_PASS?.trim();
  const bookingNotifyTo =
    process.env.BOOKING_NOTIFY_EMAIL?.trim() ||
    process.env.BUSINESS_INBOX_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim();

  if (!host || !user || !pass || !bookingNotifyTo) {
    return null;
  }

  const portRaw = process.env.SMTP_PORT?.trim();
  const port = portRaw ? Number.parseInt(portRaw, 10) : 465;
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  const secureEnv = process.env.SMTP_SECURE?.trim();
  const secure =
    secureEnv != null && secureEnv.length > 0
      ? truthy(secureEnv)
      : port === 465;

  const from = process.env.EMAIL_FROM?.trim() || user;
  const sendCustomerConfirmation = truthy(process.env.BOOKING_CUSTOMER_CONFIRMATION);

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    bookingNotifyTo,
    sendCustomerConfirmation,
  };
}
