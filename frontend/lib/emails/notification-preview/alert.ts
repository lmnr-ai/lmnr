// Port of render_alert_email / render_new_cluster_email (email.rs).
import { escapeHtml, type NotificationEmailTheme, severityColor } from "../notification-theme";
import { button, card, document, footer, header, link, panel, severityDot, severityLabel } from "./shell";

const PREFS = "https://lmnr.ai/project/demo/settings?tab=alerts";
const TRACE = "https://lmnr.ai/project/demo/traces/abc?chat=true";

function alertFooter(t: NotificationEmailTheme): string {
  return footer(t, [
    `This alert was generated automatically by ${link(t, "https://www.lmnr.ai", "Laminar")}.`,
    "You are receiving this because you are subscribed to alerts for this project.",
    link(t, PREFS, "Manage alert preferences"),
  ]);
}

export interface EventAlertData {
  eventName: string;
  projectName: string;
  alertName: string;
  severity: number;
  attributes: Record<string, string>;
}

export function renderEventAlertEmail(t: NotificationEmailTheme, d: EventAlertData): string {
  const entries = Object.entries(d.attributes);
  const detailRows = entries
    .map(
      ([key, value]) => `<tr>
  <td style="padding:6px 0;font-size:13px;color:${t.mutedText};border-bottom:1px solid ${t.hairline};vertical-align:top;">${escapeHtml(key)}</td>
  <td style="padding:6px 0 6px 12px;font-size:13px;color:${t.text};border-bottom:1px solid ${t.hairline};">${escapeHtml(value)}</td>
</tr>`
    )
    .join("\n    ");

  const attributesHtml = entries.length
    ? panel(t, "Details", `<table width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}</table>`, false)
    : "";

  const contextHtml = `<div style="text-align:center;margin-top:14px;font-size:${t.metaSize}px;color:${t.faintText};line-height:1.6;">
  ${severityDot(t, d.severity)}<span style="vertical-align:middle;">${severityLabel(d.severity)}</span><span style="vertical-align:middle;">&nbsp;·&nbsp;Alert: ${link(t, PREFS, escapeHtml(d.alertName))}</span><span style="vertical-align:middle;">&nbsp;·&nbsp;Similar events: ${link(t, PREFS, "View")}</span>
</div>`;

  const eyebrow = d.projectName ? `New event for signal · ${escapeHtml(d.projectName)}` : "New event for signal";

  const inner = [
    header(
      t,
      `<p style="margin:0 0 6px;font-size:${t.eyebrowSize}px;color:${t.faintText};">${eyebrow}</p>
    <h1 style="margin:0;font-size:${t.titleSize}px;font-weight:${t.titleWeight};color:${t.headerForeground};">${escapeHtml(d.eventName)}</h1>`
    ),
    card(t, `${attributesHtml}${button(t, TRACE, "View Trace")}${contextHtml}`),
    alertFooter(t),
  ].join("\n");

  return document(t, `${d.eventName}: ${severityLabel(d.severity)} event`, inner);
}

export interface ClusterExample {
  name: string;
  timestamp: string;
  severity: number;
  summary?: string;
}

export interface ClusterData {
  signalName: string;
  alertName: string;
  clusterName: string;
  numEvents: number;
  firstSeen?: string;
  lastSeen?: string;
  severityCounts: [number, number, number];
  examples: ClusterExample[];
}

export function renderNewClusterEmail(t: NotificationEmailTheme, d: ClusterData): string {
  const meta = [`${d.numEvents} event${d.numEvents === 1 ? "" : "s"}`];
  if (d.firstSeen) meta.push(`First seen: ${escapeHtml(d.firstSeen)}`);
  if (d.lastSeen) meta.push(`Last seen: ${escapeHtml(d.lastSeen)}`);

  const severityHtml = d.severityCounts
    .map((count, i) =>
      count > 0 ? `${severityDot(t, i)}<span style="vertical-align:middle;">${count} ${severityLabel(i)}</span>` : ""
    )
    .filter(Boolean)
    .join("&nbsp;&nbsp;");

  const examplesHtml = d.examples
    .map((event) => {
      const summary = event.summary
        ? `<div style="margin-top:4px;color:${t.bodyText};font-size:13px;">${escapeHtml(event.summary)}</div>`
        : "";
      return `<div style="background:${t.panelBackground};border:1px solid ${t.border};border-radius:6px;padding:12px;margin-bottom:8px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-size:${t.metaSize}px;color:${t.mutedText};" align="left">${severityDot(t, event.severity)}<span style="vertical-align:middle;">${escapeHtml(event.name)} &middot; ${escapeHtml(event.timestamp)}</span></td>
    <td style="font-size:${t.metaSize}px;" align="right">${link(t, TRACE, "View trace &rarr;")}</td>
  </tr></table>${summary}
</div>`;
    })
    .join("\n");

  const section = `<div>
  <h2 style="margin:0;font-size:16px;font-weight:600;"><a href="${PREFS}" style="color:${t.text};text-decoration:none;">${escapeHtml(d.clusterName)}</a></h2>
  <div style="margin:4px 0 0;font-size:${t.metaSize}px;color:${t.mutedText};">${meta.join(" &middot; ")}</div>
  ${severityHtml ? `<div style="margin:6px 0 0;font-size:${t.metaSize}px;color:${t.mutedText};">${severityHtml}</div>` : ""}
  ${examplesHtml ? `<div style="margin-top:12px;">${examplesHtml}</div>` : ""}
  <div style="margin-top:10px;font-size:13px;">${link(t, PREFS, "View cluster &rarr;")}</div>
</div>`;

  const contextHtml = `<div style="text-align:center;margin-top:18px;font-size:${t.metaSize}px;color:${t.faintText};line-height:1.6;">
  <span style="vertical-align:middle;">Alert: ${link(t, PREFS, escapeHtml(d.alertName))}</span>
</div>`;

  const inner = [
    header(
      t,
      `<p style="margin:0 0 6px;font-size:${t.eyebrowSize}px;color:${t.faintText};">New cluster</p>
    <h1 style="margin:0;font-size:${t.titleSize}px;font-weight:${t.titleWeight};color:${t.headerForeground};">${escapeHtml(d.signalName)}</h1>`
    ),
    card(t, `${section}${contextHtml}`),
    alertFooter(t),
  ].join("\n");

  return document(t, `${d.signalName}: New cluster`, inner);
}

export { severityColor };
