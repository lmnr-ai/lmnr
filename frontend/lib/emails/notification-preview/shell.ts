// Preview-only port of app-server/src/notifications/email.rs. Keep the markup
// in sync with the Rust renderers — this file does not send mail.
import { escapeHtml, type NotificationEmailTheme, severityColor, SEVERITY_LABELS } from "../notification-theme";

/** Rust attaches the logo inline as cid:laminar-logo; the preview serves the same PNG over HTTP. */
export const LOGO_SRC = "/email-logo.png";

export function button(t: NotificationEmailTheme, href: string, label: string): string {
  return `<div style="text-align:center;padding-top:8px;">
      <a href="${href}" style="display:inline-block;background:${t.primary};color:#ffffff;text-decoration:none;padding:${t.buttonPaddingY}px ${t.buttonPaddingX}px;border-radius:${t.buttonRadius}px;font-size:${t.buttonSize}px;font-weight:600;">${label}</a>
    </div>`;
}

export function severityDot(t: NotificationEmailTheme, severity: number): string {
  return `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${severityColor(t, severity)};margin-right:5px;vertical-align:middle;"></span>`;
}

export function severityLabel(severity: number): string {
  return SEVERITY_LABELS[severity] ?? "Unknown";
}

export function header(t: NotificationEmailTheme, inner: string): string {
  return `<div style="background:${t.headerBackground};border-radius:${t.cardRadius}px;padding:${t.headerPaddingY}px ${t.headerPaddingX}px;margin-bottom:20px;">
    <img src="${LOGO_SRC}" alt="Laminar" width="120" height="21" style="display:block;margin-bottom:16px;" />
    ${inner}
  </div>`;
}

export function card(t: NotificationEmailTheme, inner: string): string {
  return `<div style="background:${t.cardBackground};border-radius:${t.cardRadius}px;border:1px solid ${t.border};padding:${t.cardPadding}px;margin-bottom:20px;">${inner}</div>`;
}

export function panel(t: NotificationEmailTheme, heading: string, inner: string, uppercase = true): string {
  const caps = uppercase ? "text-transform:uppercase;letter-spacing:0.05em;" : "";
  return `<div style="background:${t.panelBackground};border:1px solid ${t.border};border-radius:8px;padding:16px;margin-bottom:20px;">
  <h3 style="margin:0 0 12px;font-size:${t.bodySize}px;font-weight:600;color:${t.mutedText};${caps}">${heading}</h3>
  ${inner}
</div>`;
}

export function footer(t: NotificationEmailTheme, lines: string[]): string {
  const body = lines
    .map((line, i) => {
      const margin = i === lines.length - 1 ? "0" : "0 0 4px";
      return `<p style="margin:${margin};font-size:${t.metaSize}px;color:${t.faintText};">${line}</p>`;
    })
    .join("\n    ");
  return `<div style="text-align:center;padding:16px 0;">
    ${body}
  </div>`;
}

export function link(t: NotificationEmailTheme, href: string, label: string): string {
  return `<a href="${href}" style="color:${t.primary};text-decoration:none;">${label}</a>`;
}

export function document(
  t: NotificationEmailTheme,
  title: string,
  inner: string,
  options: { contentWidth?: number; paddingX?: number } = {}
): string {
  const contentWidth = options.contentWidth ?? t.contentWidth;
  const paddingX = options.paddingX ?? 16;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
@media screen and (max-width:720px) {
  .email-body { background:transparent !important; }
  .email-report-card { background:#fafafa !important; }
  .email-shell { padding-left:0 !important; padding-right:0 !important; }
}
</style>
</head>
<body class="email-body" style="margin:0;padding:0;background:${t.pageBackground};font-family:${t.fontFamily};">
<div class="email-shell" style="max-width:${contentWidth}px;margin:0 auto;padding:24px ${paddingX}px;">
${inner}
</div>
</body>
</html>`;
}
