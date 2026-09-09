// PROTOTYPE — applies the Signals Report visual language to every other email.
// Keep this separate from production renderers until a direction is selected.
import { getClusterColorById } from "../cluster-color";
import { blendHex, escapeHtml, type NotificationEmailTheme } from "../notification-theme";
import { barChart, clusterGlyph } from "./report-parts";
import { document, footer, link } from "./shell";

const LOGO = "/report-logo.png";
const ACTION = "https://lmnr.ai";
// Email-only Primary 50, one step lighter than the existing Primary 100 ramp.
const EMAIL_PRIMARY_50 = "#e49970";
const REGULAR_WIDTH = 680;
const MINI_WIDTH = 544;
const NEW_CLUSTER_ID = "9c2e5d11-2222-4000-8000-00000000bb01";
const MINI_TEMPLATES = new Set([
  "workspace-invite",
  "payment-received",
  "payment-failed",
  "usage-warning",
  "usage-hard-limit",
]);

function banner(t: NotificationEmailTheme, workspace: string, title: string, subtitle: string): string {
  const height = subtitle ? 200 : 160;
  const rowHeight = height / 2;
  return `<table width="100%" height="${height}" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:680px;height:${height}px;background:${t.reportHeaderBackground};border-radius:8px;margin-bottom:4px;">
  <tr height="${rowHeight}"><td valign="top" style="padding:16px 20px 0;">
    <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr height="15">
      <td width="76" height="15" valign="middle" style="width:76px;height:15px;line-height:0;"><img src="${LOGO}" alt="Laminar" width="76" height="13" style="display:block;width:76px;height:13px;border:0;" /></td>
      <td width="8" style="width:8px;font-size:0;">&nbsp;</td>
      <td valign="middle" style="font-size:16px;font-weight:400;line-height:15px;letter-spacing:-0.32px;color:${t.reportHeaderText};"><span style="display:inline-block;vertical-align:${-t.reportHeaderIdentityOffsetY}px;">/</span></td>
      <td width="8" style="width:8px;font-size:0;">&nbsp;</td>
      <td valign="middle" style="font-size:16px;font-weight:400;line-height:15px;letter-spacing:-0.32px;color:${t.reportHeaderText};white-space:nowrap;"><span style="display:inline-block;vertical-align:${-t.reportHeaderIdentityOffsetY}px;">${escapeHtml(workspace)}</span></td>
    </tr></table>
  </td></tr>
  <tr height="${rowHeight}"><td valign="bottom" style="padding:0 20px ${subtitle ? 16 : 12}px;">
    <p style="margin:0 0 6px;font-size:28px;font-weight:400;letter-spacing:-0.56px;color:#ffffff;line-height:normal;">${escapeHtml(title)}</p>
    ${subtitle ? `<p style="margin:0;font-size:16px;font-weight:400;letter-spacing:-0.32px;color:${t.reportHeaderText};line-height:normal;">${escapeHtml(subtitle)}</p>` : ""}
  </td></tr>
</table>`;
}

function card(t: NotificationEmailTheme, inner: string): string {
  return `<div style="background:${t.reportSurface};border-radius:${t.cardRadius}px;padding:20px;margin-bottom:4px;">${inner}</div>`;
}

function viewButton(t: NotificationEmailTheme): string {
  return `<a class="email-view-button" href="${ACTION}" style="display:inline-block;background:${t.reportChartFill};border-radius:999px;color:${t.text};font-size:${t.metaSize}px;line-height:16px;padding:4px 10px;text-decoration:none;white-space:nowrap;">View&nbsp;›</a>`;
}

function heading(t: NotificationEmailTheme, ...parts: string[]): string {
  const crumbs = parts
    .map(
      (part, index) =>
        `<td style="font-size:16px;font-weight:400;letter-spacing:-0.32px;color:${index === parts.length - 1 ? t.text : t.mutedText};white-space:nowrap;">${escapeHtml(part)}</td>`
    )
    .join(
      `<td width="10" style="width:10px;font-size:0;">&nbsp;</td><td style="font-size:16px;color:${t.mutedText};">/</td><td width="10" style="width:10px;font-size:0;">&nbsp;</td>`
    );
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
    <td valign="top"><table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
      ${crumbs}
    </tr></table></td>
    <td width="54" align="right" valign="top">${viewButton(t)}</td>
  </tr></table>`;
}

function clusterTitle(t: NotificationEmailTheme, name: string, color: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:16px;"><tr>
    <td width="24" valign="middle" style="line-height:0;">${clusterGlyph(color)}</td>
    <td valign="middle" style="font-size:20px;font-weight:500;letter-spacing:-0.4px;color:${t.text};line-height:24px;">${escapeHtml(name)}</td>
  </tr></table>`;
}

function paragraph(t: NotificationEmailTheme, text: string, first = false): string {
  return `<p style="margin:${first ? 0 : 16}px 0 0;font-size:${t.bodySize}px;line-height:${t.bodyLineHeight};color:${t.bodyText};">${escapeHtml(text)}</p>`;
}

function action(t: NotificationEmailTheme, label: string, align: "left" | "center" = "center"): string {
  return `<div style="margin-top:20px;text-align:${align};"><a href="${ACTION}" style="display:inline-block;background:${EMAIL_PRIMARY_50};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:4px;font-size:${t.bodySize}px;font-weight:400;">${escapeHtml(label)}</a></div>`;
}

function rows(t: NotificationEmailTheme, entries: Array<[string, string]>): string {
  return `<div style="margin-top:20px;">${entries
    .map(
      ([
        label,
        value,
      ]) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${t.reportRowBackground};border-radius:4px;margin-bottom:4px;"><tr>
      <td style="padding:7px 10px;font-size:${t.bodySize}px;color:${t.mutedText};">${escapeHtml(label)}</td>
      <td align="right" style="padding:7px 10px;font-size:${t.bodySize}px;color:${t.text};">${escapeHtml(value)}</td>
    </tr></table>`
    )
    .join("")}</div>`;
}

function featureList(t: NotificationEmailTheme): string {
  return `<div style="margin-top:20px;">${[
    ["Trace your agents", "Capture every model call and tool invocation"],
    ["Signals", "Track outcomes and errors across traces"],
    ["Debugger", "Replay agents from any checkpoint"],
    ["SQL engine", "Query all observability data directly"],
  ]
    .map(
      ([
        name,
        detail,
      ]) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${t.reportRowBackground};border-radius:8px;margin-bottom:4px;"><tr>
      <td style="padding:10px;font-size:${t.bodySize}px;color:${t.text};">${name}<div style="margin-top:2px;color:${t.mutedText};font-size:${t.metaSize}px;">${detail}</div></td>
      <td width="54" style="padding:6px 4px 6px 10px;" align="right">${viewButton(t)}</td>
    </tr></table>`
    )
    .join("")}</div>`;
}

function bodyFor(t: NotificationEmailTheme, template: string): { title: string; subtitle: string; body: string } {
  switch (template) {
    case "signal-event":
      return {
        title: "Critical signal event",
        subtitle: "",
        body: card(
          t,
          heading(t, "acme-production", "Failure Detector") +
            paragraph(
              t,
              "The checkout agent told a customer that refunds are processed in 2 days; the actual policy is 14 days."
            ) +
            rows(t, [
              ["Severity", "Critical"],
              ["Model", "gpt-4o-mini"],
              ["Confidence", "92%"],
              ["User", "usr_8f21c3"],
            ]) +
            action(t, "View trace")
        ),
      };
    case "new-cluster": {
      const clusterColor = getClusterColorById(NEW_CLUSTER_ID);
      const chartFill = blendHex(clusterColor, t.reportSurface, 0.25);
      const buckets = [2, 4, 1, 7, 3, 9, 8, 13, 11, 16, 14, 22].map((value, i) => ({
        value,
        label: ["Mar 2", "Mar 3", "Mar 4"][Math.floor(i / 4)],
      }));

      return {
        title: "New Signal Cluster",
        subtitle: "",
        body: card(
          t,
          heading(t, "acme-production", "Policy hallucination") +
            clusterTitle(t, "Refund window misstated", clusterColor) +
            `<div style="margin-top:24px;">
              <p style="margin:0 0 4px;font-size:${t.bodySize}px;font-weight:500;color:${t.text};">Events</p>
              <div style="font-size:${t.reportMetricSize}px;font-weight:500;color:${t.text};line-height:1;">34</div>
              <div style="margin-top:12px;">${barChart(t, buckets, chartFill)}</div>
            </div>` +
            rows(t, [
              ["Critical", "19 events"],
              ["Warning", "11 events"],
              ["Info", "4 events"],
              ["First event", "Mar 1, 09:12 UTC"],
              ["Last event", "Mar 4, 17:40 UTC"],
            ]) +
            action(t, "View cluster")
        ),
      };
    }
    case "usage-warning":
      return {
        title: "Usage warning",
        subtitle: "",
        body: card(
          t,
          paragraph(
            t,
            "Your workspace has used all data ingestion included in the Pro plan for this billing cycle. Additional usage is now billed at the overage rate.",
            true
          ) +
            rows(t, [
              ["Current usage", "50 GB"],
              ["Included", "50 GB"],
              ["Plan", "Pro"],
              ["Resets", "April 1, 2026"],
            ]) +
            action(t, "View usage")
        ),
      };
    case "usage-hard-limit":
      return {
        title: "Usage limit reached",
        subtitle: "Data ingestion has paused",
        body: card(
          t,
          paragraph(
            t,
            "Your workspace reached its hard limit. New data will not be ingested until the billing cycle resets or the limit is changed.",
            true
          ) +
            rows(t, [
              ["Current usage", "50 GB"],
              ["Hard limit", "50 GB"],
              ["Status", "Paused"],
              ["Resets", "April 1, 2026"],
            ]) +
            action(t, "Manage limit")
        ),
      };
    case "workspace-invite":
      return {
        title: "Join Acme AI on Laminar 🎉",
        subtitle: "",
        body: card(
          t,
          paragraph(t, "You've been invited to collaborate on Acme AI workspace.", true) +
            paragraph(
              t,
              "With Laminar you can trace, evaluate, label, and analyze LLM applications together with your team."
            ) +
            paragraph(t, "This invitation will expire in 7 days.") +
            action(t, "Accept invitation", "left") +
            paragraph(t, "If you have any questions, check out our documentation or reach out to our team.") +
            paragraph(t, "The Laminar Team")
        ),
      };
    case "payment-received":
      return {
        title: "Payment received",
        subtitle: "",
        body: card(
          t,
          paragraph(t, "Thanks for your payment.", true) +
            rows(t, [
              ["Total", "$249.00"],
              ["Date", "March 4, 2026"],
              ["Billed to", "billing@acme.ai"],
              ["Status", "Paid"],
            ]) +
            paragraph(t, "You can view and download invoices in your Stripe billing portal.") +
            action(t, "View invoice")
        ),
      };
    case "payment-failed":
      return {
        title: "Payment failed",
        subtitle: "",
        body: card(
          t,
          paragraph(
            t,
            "We could not process your payment. Update your payment method to prevent an interruption to your workspace.",
            true
          ) +
            rows(t, [
              ["Amount due", "$249.00"],
              ["Date", "March 4, 2026"],
              ["Billed to", "billing@acme.ai"],
              ["Status", "Past due"],
            ]) +
            action(t, "Update payment")
        ),
      };
    default:
      return {
        title: "Welcome to Laminar",
        subtitle: "Observability built for AI agents",
        body: card(
          t,
          heading(t, "Laminar", "Getting started") +
            paragraph(
              t,
              "Trace every model call and tool execution, then use that data to debug, analyze, and improve your agents at scale."
            ) +
            featureList(t) +
            action(t, "Open Laminar")
        ),
      };
  }
}

export function renderNotificationPrototype(t: NotificationEmailTheme, template: string): string {
  const content = bodyFor(t, template);
  const contentWidth = MINI_TEMPLATES.has(template) ? MINI_WIDTH : REGULAR_WIDTH;
  const inner = [
    banner(t, "Acme AI", content.title, content.subtitle),
    content.body,
    footer(t, [
      `This email was sent automatically by ${link(t, "https://www.lmnr.ai", "Laminar")}.`,
      link(t, ACTION, "Manage notification preferences"),
    ]),
  ].join("\n");
  return document(t, content.title, inner, { contentWidth, paddingX: 20 });
}
