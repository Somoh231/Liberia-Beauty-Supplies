import { escapeHtml } from "@/lib/email/escape-html";
import { SITE_NAME } from "@/lib/site";

export function emailDocument(title: string, bodyHtml: string): string {
  const safeTitle = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#0c0b0a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#fffcf7;border:1px solid rgba(12,11,10,0.08);border-radius:12px;overflow:hidden;box-shadow:0 24px 48px -28px rgba(12,11,10,0.12);">
          <tr>
            <td style="padding:20px 24px 8px 24px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#8c6a3a;">
              ${escapeHtml(SITE_NAME)}
            </td>
          </tr>
          <tr>
            <td style="padding:4px 24px 24px 24px;font-size:15px;line-height:1.55;color:#1a1918;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
