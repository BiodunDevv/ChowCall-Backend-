import { emailTheme, type EmailTemplateInput } from "../email-theme.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paragraphize(body: string) {
  return body
    .split("\n")
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 14px;color:${emailTheme.muted};font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`
    )
    .join("");
}

function renderDetails(details: EmailTemplateInput["details"]) {
  if (!details?.length) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="margin:22px 0;border:1px solid ${emailTheme.border};border-radius:12px;overflow:hidden;background:#ffffff;">
      ${details
        .map(
          (d, i) => `
          <tr>
            <td style="padding:12px 16px;${i < details.length - 1 ? `border-bottom:1px solid ${emailTheme.border};` : ""}color:${emailTheme.muted};font-size:13px;">${escapeHtml(d.label)}</td>
            <td align="right" style="padding:12px 16px;${i < details.length - 1 ? `border-bottom:1px solid ${emailTheme.border};` : ""}color:${emailTheme.text};font-size:13px;font-weight:700;">${escapeHtml(d.value)}</td>
          </tr>`
        )
        .join("")}
    </table>`;
}

function renderAction(action?: { label: string; href: string }, secondary = false) {
  if (!action) return "";
  const bg = secondary ? "transparent" : emailTheme.primary;
  const color = secondary ? emailTheme.text : emailTheme.primaryForeground;
  const border = secondary ? emailTheme.border : emailTheme.primary;
  const margin = secondary ? "10px 0 0 10px" : "18px 0 0";
  return `
    <a href="${escapeHtml(action.href)}"
      style="display:inline-block;margin:${margin};padding:12px 22px;border-radius:10px;border:1px solid ${border};background:${bg};color:${color};font-size:14px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;">
      ${escapeHtml(action.label)}
    </a>`;
}

export function renderEmailLayout(input: EmailTemplateInput) {
  const logoMarkup = emailTheme.logoUrl
    ? `<img src="${emailTheme.logoUrl}" width="36" height="36" alt="ChowCall" style="display:block;border:0;border-radius:9px;">`
    : `<div style="width:36px;height:36px;border-radius:9px;background:${emailTheme.primary};display:inline-block;"></div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
    <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  </head>
  <body style="margin:0;padding:0;background:${emailTheme.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${emailTheme.text};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

    <!-- Preview text (hidden) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:transparent;line-height:1px;">
      ${escapeHtml(input.previewText)}&nbsp;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:${emailTheme.background};padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
            style="max-width:580px;">

            <!-- Logo header -->
            <tr>
              <td style="padding:0 4px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      ${logoMarkup}
                    </td>
                    <td style="vertical-align:middle;padding-left:10px;font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${emailTheme.text};">
                      ChowCall
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Card -->
            <tr>
              <td style="background:${emailTheme.card};border:1px solid ${emailTheme.border};border-radius:18px;padding:32px 30px;">
                ${input.eyebrow
                  ? `<p style="margin:0 0 12px;color:${emailTheme.primary};font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>`
                  : ""}
                <h1 style="margin:0 0 16px;color:${emailTheme.text};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.03em;">${escapeHtml(input.title)}</h1>
                ${paragraphize(input.body)}
                ${renderDetails(input.details)}
                ${renderAction(input.action)}
                ${renderAction(input.secondaryAction, true)}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 4px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="color:${emailTheme.muted};font-size:12px;line-height:1.7;">
                      ${escapeHtml(input.footerNote ?? "ChowCall helps restaurants turn phone calls into confirmed paid orders.")}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:14px;border-top:1px solid ${emailTheme.border};color:${emailTheme.muted};font-size:11px;line-height:1.6;">
                      &copy; ${new Date().getFullYear()} ChowCall. All rights reserved.<br>
                      If you didn&rsquo;t request this email, you can safely ignore it.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
