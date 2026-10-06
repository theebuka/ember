/**
 * Every email ember sends, in one layout.
 *
 * Used by `send-digests.mjs` at send time and by `build-email-templates.mjs` to
 * write the Supabase auth templates (sign-in link, confirm, change email, code),
 * so the digest and the sign-in link are one design rather than two.
 *
 * Built to the email client, not the browser:
 *
 * - **Tables and inline styles.** Gmail strips `<style>` in some contexts and
 *   Outlook for Windows renders with Word. Everything that must survive is
 *   inline; the `<style>` block only adds dark mode and the phone breakpoint,
 *   which are enhancements where they are supported and harmless where not.
 * - **No images.** No hosted logo, no pixel. The mark is a coloured cell, so it
 *   draws with images blocked — which is the default in many clients — and
 *   nothing in this mail fetches anything when it is opened (§5: no tracking
 *   pixel, ever).
 * - **A system font stack.** Geist is not installed on anybody's phone, and a web
 *   font in email is a remote fetch most clients refuse.
 * - **Bulletproof buttons.** A padded table cell with the link inside, so the
 *   whole button is the target in Outlook too.
 * - **A preheader.** The line an inbox shows beside the subject; without one the
 *   client shows whatever text comes first, which was "EMBER".
 *
 * Colours are the app's tokens (`src/app/globals.css`), copied as literals for
 * the same reason `public/offline.html` copies them: no stylesheet reaches here.
 */

export const COLOR = {
  ink: "#0B0C0F",
  graphite: "#2E3038",
  stone: "#62656F",
  line: "#ECEDF1",
  canvas: "#F3F4F7",
  surface: "#FFFFFF",
  surface2: "#F5F6F8",
  brand: "#2563EB",
  brandText: "#1B4FD0",
  brandTint: "#EEF3FE",
  up: "#0A7C55",
  upTint: "#E7F4EF",
  down: "#C8322F",
  downTint: "#FBECEB",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji'";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

/** For anything interpolated into markup that did not come from this file. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A paragraph of body copy. `html` is trusted markup. */
export function paragraph(html, { muted = false, size = 15, top = 16 } = {}) {
  return `<p class="${muted ? "em-muted" : "em-text"}" style="margin:${top}px 0 0;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${muted ? COLOR.stone : COLOR.graphite};">${html}</p>`;
}

/** The primary action. One per email. */
export function button(label, href) {
  // The padding is on the cell, so Outlook (which ignores padding on a link)
  // still draws a full-size button; the link fills it everywhere else.
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
  <tr>
    <td align="center" bgcolor="${COLOR.brand}" style="border-radius:999px;background:${COLOR.brand};mso-padding-alt:14px 28px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/**
 * The link under the button, for a client that won't open it — and for somebody
 * who wants to see where a sign-in link goes before pressing it.
 */
export function fallbackLink(href) {
  return `<p class="em-muted" style="margin:24px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLOR.stone};">Button not working? Paste this link into your browser:</p>
<p style="margin:4px 0 0;font-family:${MONO};font-size:12px;line-height:18px;word-break:break-all;"><a href="${href}" target="_blank" class="em-link" style="color:${COLOR.brandText};text-decoration:none;">${href}</a></p>`;
}

/** A one-time code, large and spaced so it can be read across a room. */
export function codeBlock(code) {
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
  <tr>
    <td align="center" class="em-well" bgcolor="${COLOR.surface2}" style="background:${COLOR.surface2};border-radius:12px;padding:20px 16px;">
      <span class="em-ink" style="font-family:${MONO};font-size:32px;line-height:40px;font-weight:600;letter-spacing:8px;color:${COLOR.ink};">${code}</span>
    </td>
  </tr>
</table>`;
}

/** A hairline across the card. */
export function rule(top = 32) {
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:${top}px 0 0;"><tr><td class="em-rule" style="border-top:1px solid ${COLOR.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/**
 * A small note under a rule — why the reader got this, what to do if it wasn't
 * them. Security copy lives here, not in the headline.
 */
export function note(html) {
  return `${rule()}${paragraph(html, { muted: true, size: 13, top: 20 })}`;
}

/**
 * The whole message.
 *
 * @param {object} o
 * @param {string} o.title      `<title>`, and the heading.
 * @param {string} o.preheader  The inbox preview line. Plain text.
 * @param {string} o.body       Trusted markup for the card, after the heading.
 * @param {string} [o.eyebrow]  A short line above the heading.
 * @param {string} [o.footer]   Trusted markup under the card.
 */
export function renderEmail({ title, preheader, body, eyebrow, footer = "" }) {
  // Padding after the preheader, so the client's preview stops there rather than
  // running on into the heading.
  const spacer = "&#847;&zwnj;&nbsp;".repeat(60);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  a { color:${COLOR.brandText}; }
  @media (max-width:620px) {
    .em-shell { padding:16px 12px 32px !important; }
    .em-card { padding:28px 22px !important; }
    .em-title { font-size:22px !important; line-height:30px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .em-bg { background:#060709 !important; }
    .em-card { background:#101216 !important; border-color:#23262E !important; }
    .em-ink, .em-title { color:#F4F5F7 !important; }
    .em-text { color:#C9CCD4 !important; }
    .em-muted { color:#8E919B !important; }
    .em-rule { border-color:#23262E !important; }
    .em-well { background:#171A20 !important; }
    .em-link { color:#8AB0FF !important; }
    .em-row { border-color:#23262E !important; }
    .em-up { background:#0F2A20 !important; color:#3ECF8E !important; }
    .em-down { background:#3A1716 !important; color:#FF7A75 !important; }
  }
  /* Outlook.com and the Outlook apps invert colours themselves and expose it here. */
  [data-ogsc] .em-ink, [data-ogsc] .em-title { color:#F4F5F7 !important; }
  [data-ogsc] .em-text { color:#C9CCD4 !important; }
  [data-ogsc] .em-muted { color:#8E919B !important; }
</style>
</head>
<body class="em-bg" style="margin:0;padding:0;background:${COLOR.canvas};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.canvas};opacity:0;">${escapeHtml(preheader)}${spacer}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="em-bg" bgcolor="${COLOR.canvas}" style="background:${COLOR.canvas};">
  <tr>
    <td align="center" class="em-shell" style="padding:40px 16px 48px;">
      <!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle" style="padding-right:8px;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="12" height="12" bgcolor="${COLOR.brand}" style="width:12px;height:12px;background:${COLOR.brand};border-radius:6px;font-size:0;line-height:0;">&nbsp;</td></tr></table>
                </td>
                <td valign="middle" class="em-ink" style="font-family:${FONT};font-size:19px;line-height:24px;font-weight:600;letter-spacing:-0.3px;color:${COLOR.ink};">ember</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="em-card" bgcolor="${COLOR.surface}" style="background:${COLOR.surface};border:1px solid ${COLOR.line};border-radius:16px;padding:40px 40px 36px;">
            ${eyebrow ? `<p class="em-muted" style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:20px;font-weight:500;color:${COLOR.stone};">${eyebrow}</p>` : ""}
            <h1 class="em-title" style="margin:0;font-family:${FONT};font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.4px;color:${COLOR.ink};">${escapeHtml(title)}</h1>
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0;">
            ${footer}
            <p class="em-muted" style="margin:${footer ? 12 : 0}px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLOR.stone};">ember gives information, not financial advice.</p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>
`;
}

/** Footer copy, for `renderEmail`'s `footer`. */
export function footerLine(html) {
  return `<p class="em-muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLOR.stone};">${html}</p>`;
}

export { FONT, MONO };
