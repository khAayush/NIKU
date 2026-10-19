import { env } from './env.js';

/**
 * The app's email layout: black & white, matching the app. Produces an HTML version (table layout
 * and inline styles, which is what email clients support) and a plain-text version.
 * Every value is HTML-escaped, so task titles and names can't inject markup.
 */

export interface EmailContent {
  /** Short preview line shown next to the subject in most inboxes. */
  preheader: string;
  /** Small spaced label above the heading, e.g. "REMINDER". */
  eyebrow?: string;
  heading: string;
  paragraphs: string[];
  /** Label/value rows shown in a box, e.g. { label: 'Due', value: 'Sun 18 Oct, 17:00' }. */
  details?: { label: string; value: string }[];
  button?: { label: string; url: string };
  /** Small print under the button, e.g. "This link expires in 30 minutes." */
  note?: string;
}

export const NO_REPLY_NOTICE = `This is a system-generated email from ${env.APP_NAME}. Please do not reply to this email, as replies are not monitored.`;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(c: EmailContent): string {
  const e = escapeHtml;
  const paragraphs = c.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#404040;">${e(p)}</p>`,
    )
    .join('');

  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border:1px solid #e5e5e5;border-radius:12px;">
        ${c.details
          .map(
            (d, i) => `<tr>
              <td style="padding:14px 18px;${i ? 'border-top:1px solid #f0f0f0;' : ''}font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a3a3a3;width:90px;vertical-align:top;">${e(d.label)}</td>
              <td style="padding:14px 18px;${i ? 'border-top:1px solid #f0f0f0;' : ''}font-size:15px;color:#0a0a0a;">${e(d.value)}</td>
            </tr>`,
          )
          .join('')}
      </table>`
    : '';

  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;">
        <tr><td style="border-radius:999px;background:#0a0a0a;">
          <a href="${e(c.button.url)}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${e(c.button.label)}</a>
        </td></tr>
      </table>`
    : '';

  const note = c.note
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#737373;">${e(c.note)}</p>`
    : '';

  const fallbackLink = c.button
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#a3a3a3;">If the button doesn't work, copy this link into your browser:<br><a href="${e(c.button.url)}" style="color:#525252;word-break:break-all;">${e(c.button.url)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${e(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 8px 24px;font-size:14px;font-weight:600;letter-spacing:6px;color:#0a0a0a;">${e(env.APP_NAME)}</td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e5e5e5;border-radius:20px;padding:40px 36px;">
        ${c.eyebrow ? `<p style="margin:0 0 10px;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:#a3a3a3;">${e(c.eyebrow)}</p>` : ''}
        <h1 style="margin:0 0 20px;font-size:26px;line-height:32px;font-weight:600;letter-spacing:-0.4px;color:#0a0a0a;">${e(c.heading)}</h1>
        ${paragraphs}
        ${details}
        ${button}
        ${note}
        ${fallbackLink}
      </td></tr>
      <tr><td style="padding:24px 8px 0;font-size:12px;line-height:18px;color:#a3a3a3;">
        ${e(NO_REPLY_NOTICE)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderText(c: EmailContent): string {
  const lines = [env.APP_NAME, ''];
  if (c.eyebrow) lines.push(c.eyebrow.toUpperCase());
  lines.push(c.heading, '', ...c.paragraphs.flatMap((p) => [p, '']));
  if (c.details?.length) {
    lines.push(...c.details.map((d) => `${d.label}: ${d.value}`), '');
  }
  if (c.button) lines.push(`${c.button.label}: ${c.button.url}`, '');
  if (c.note) lines.push(c.note, '');
  lines.push('--', NO_REPLY_NOTICE);
  return lines.join('\n');
}

/** Renders an email in the app's style, as HTML plus a plain-text alternative. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  return { html: renderHtml(content), text: renderText(content) };
}
