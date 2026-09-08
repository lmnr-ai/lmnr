// Redesigned Signals Report (Figma 4646:3638). One card per SIGNAL.
// Preview-only; keep in sync with the Rust renderer.
import { escapeHtml, type NotificationEmailTheme } from "../notification-theme";
import { barChart, type ChartBucket, type ClusterRow, clusterRow, deltaCell, icon, rankClusters } from "./report-parts";
import { document, footer, link } from "./shell";

const REPORT_LOGO_SRC = "/report-logo.png";

const REPORTS_LINK = "https://lmnr.ai/workspace/demo?tab=reports";
const MAX_CLUSTERS = 5;

export interface ReportSignal {
  signalId: string;
  signalName: string;
  projectName: string;
  href: string;
  summary: string;
  eventCount: number;
  prevEventCount: number;
  buckets: ChartBucket[];
  clusters: ClusterRow[];
}

export interface ReportData {
  workspaceName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  totalEvents: number;
  signals: ReportSignal[];
}

/** Breadcrumb + arrow, matching Figma node 4646:3708. */
function signalHeading(t: NotificationEmailTheme, s: ReportSignal): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
    <tr>
      <td align="left" valign="top">
        <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr>
          <td style="font-size:16px;font-weight:400;letter-spacing:-0.32px;color:${t.mutedText};white-space:nowrap;">${escapeHtml(s.projectName)}</td>
          <td width="10" style="width:10px;font-size:0;">&nbsp;</td>
          <td style="font-size:16px;font-weight:400;letter-spacing:-0.32px;color:${t.mutedText};">/</td>
          <td width="10" style="width:10px;font-size:0;">&nbsp;</td>
          <td style="font-size:16px;font-weight:400;letter-spacing:-0.32px;color:${t.text};white-space:nowrap;">${escapeHtml(s.signalName)}</td>
        </tr></table>
      </td>
      <td align="right" valign="top" width="20">
        <a href="${s.href}" style="text-decoration:none;">${icon("arrow-up-right", t.mutedText, 20)}</a>
      </td>
    </tr>
  </table>`;
}

function signalCard(t: NotificationEmailTheme, s: ReportSignal): string {
  const ranked = rankClusters(s.clusters, MAX_CLUSTERS);
  const maxCount = Math.max(...ranked.map((c) => c.count), 1);

  const clustersHtml = ranked.length
    ? `<p style="margin:0 0 12px;font-size:${t.bodySize}px;font-weight:500;color:${t.text};">Notable clusters</p>
      ${ranked.map((c) => clusterRow(t, c, maxCount)).join("\n")}`
    : `<p style="margin:0;font-size:${t.bodySize}px;color:${t.faintText};">No notable clusters in this period.</p>`;

  return `<div style="background:${t.reportSurface};border-radius:${t.cardRadius}px;padding:16px 20px;margin-bottom:4px;">
  ${signalHeading(t, s)}
  <p style="margin:16px 0 0;font-size:${t.bodySize}px;color:${t.text};line-height:${t.bodyLineHeight};">${escapeHtml(s.summary)}</p>

  <div style="margin-top:24px;">
    <p style="margin:0 0 4px;font-size:${t.bodySize}px;font-weight:500;color:${t.text};">Events</p>
    <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr valign="bottom">
      <td style="font-size:${t.reportMetricSize}px;font-weight:500;color:${t.text};line-height:1;padding-right:6px;">${s.eventCount}</td>
      <td style="padding-bottom:2px;">${deltaCell(t, s.eventCount, s.prevEventCount)}
        <span style="font-size:${t.metaSize}px;color:${t.mutedText};">&nbsp;vs previous period</span></td>
    </tr></table>
    <div style="margin-top:12px;">${barChart(t, s.buckets)}</div>
  </div>

  <div style="margin-top:24px;">${clustersHtml}</div>
</div>`;
}

export function renderReportEmail(t: NotificationEmailTheme, d: ReportData): string {
  const cards = d.signals.length
    ? d.signals.map((s) => signalCard(t, s)).join("\n")
    : `<p style="color:${t.faintText};font-size:${t.bodySize}px;text-align:center;padding:24px 0;">No signal activity in this period.</p>`;

  // Figma 4646:3637: 680×200, 20px horizontal / 16px vertical padding,
  // 8px radius, with the identity and title groups pinned to opposite edges.
  const head = `<table width="100%" height="200" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:680px;height:200px;background:${t.reportHeaderBackground};border-radius:8px;margin-bottom:4px;">
    <tr height="100">
      <td valign="top" style="padding:16px 20px 0;">
        <table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr height="15">
          <td width="76" height="15" valign="middle" style="width:76px;height:15px;line-height:0;">
            <img src="${REPORT_LOGO_SRC}" alt="Laminar" width="76" height="13" style="display:block;width:76px;height:13px;border:0;" />
          </td>
          <td width="8" style="width:8px;font-size:0;">&nbsp;</td>
          <td valign="middle" style="font-size:16px;font-weight:400;line-height:15px;letter-spacing:-0.32px;color:${t.reportHeaderText};"><span style="display:inline-block;vertical-align:${-t.reportHeaderIdentityOffsetY}px;">/</span></td>
          <td width="8" style="width:8px;font-size:0;">&nbsp;</td>
          <td valign="middle" style="font-size:16px;font-weight:400;line-height:15px;letter-spacing:-0.32px;color:${t.reportHeaderText};white-space:nowrap;"><span style="display:inline-block;vertical-align:${-t.reportHeaderIdentityOffsetY}px;">${escapeHtml(d.workspaceName)}</span></td>
        </tr></table>
      </td>
    </tr>
    <tr height="100">
      <td valign="bottom" style="padding:0 20px 16px;">
        <p style="margin:0 0 6px;font-size:28px;font-weight:400;letter-spacing:-0.56px;color:#ffffff;line-height:normal;">Signals Report</p>
        <p style="margin:0;font-size:16px;font-weight:400;letter-spacing:-0.32px;color:${t.reportHeaderText};line-height:normal;">${escapeHtml(d.periodStart)} - ${escapeHtml(d.periodEnd)}</p>
      </td>
    </tr>
  </table>`;

  const inner = [
    head,
    cards,
    footer(t, [
      `This report was generated automatically by ${link(t, "https://www.lmnr.ai", "Laminar")}.`,
      `You are receiving this because you are subscribed to reports for the ${escapeHtml(d.workspaceName)} workspace.`,
      link(t, REPORTS_LINK, "Unsubscribe"),
    ]),
  ].join("\n");

  // Figma root is 720px: 680px content + 20px gutters on each side.
  return document(t, `Signals Report – ${d.workspaceName}`, inner, {
    contentWidth: 680,
    paddingX: 20,
  });
}
