// Port of render_usage_warning_email / render_usage_hard_limit_email (email.rs).
import { escapeHtml, type NotificationEmailTheme } from "../notification-theme";
import { button, card, document, footer, header, link } from "./shell";

const USAGE_LINK = "https://lmnr.ai/workspace/demo?tab=usage";

export interface UsageData {
  workspaceName: string;
  usageLabel: string;
  formattedLimit: string;
  usageItem: "bytes" | "signal_cost";
  atTierIncludedAllowance: boolean;
  tierDisplayName: string;
  overageBillable: boolean;
}

function para(t: NotificationEmailTheme, html: string): string {
  return `<p style="margin:0 0 16px;font-size:${t.bodySize}px;color:${t.bodyText};line-height:${t.bodyLineHeight};">
      ${html}
    </p>`;
}

function usageFooter(t: NotificationEmailTheme, workspaceName: string, manageLabel: string): string {
  return footer(t, [
    `This notification was generated automatically by ${link(t, "https://www.lmnr.ai", "Laminar")}.`,
    `You are receiving this because you are the owner of the ${escapeHtml(workspaceName)} workspace.`,
    link(t, USAGE_LINK, manageLabel),
  ]);
}

export function renderUsageWarningEmail(t: NotificationEmailTheme, d: UsageData): string {
  const meterDescription = d.usageItem === "bytes" ? "data ingestion" : "Signals usage";
  const ws = escapeHtml(d.workspaceName);

  let tierMessage = "";
  if (d.atTierIncludedAllowance) {
    const tierLabel = d.tierDisplayName ? ` ${escapeHtml(d.tierDisplayName)}` : "";
    const billing = d.overageBillable
      ? ` <strong>From now until the next billing cycle, any further ${meterDescription} is billable.</strong> It is charged pay-as-you-go at the${tierLabel} tier's overage rate, on top of your flat monthly rate.`
      : "";
    tierMessage = para(
      t,
      `This threshold equals the ${meterDescription} already included in your${tierLabel} plan's flat monthly rate, so you have now used up everything bundled into your plan for this cycle.${billing}`
    );
  }

  const secondary = d.atTierIncludedAllowance
    ? ""
    : para(
        t,
        "This is a warning notification you configured. No action is required unless you want to adjust your usage or limits."
      );

  const inner = [
    header(
      t,
      `<h1 style="margin:0 0 8px;font-size:${t.titleSize}px;font-weight:${t.titleWeight};color:${t.headerForeground};">Usage Warning</h1>
    <p style="margin:0;font-size:16px;color:${t.primary};">${escapeHtml(d.usageLabel)} threshold reached</p>`
    ),
    card(
      t,
      `${para(t, `Your workspace <strong>${ws}</strong> has reached <strong>${escapeHtml(d.formattedLimit)}</strong> of ${meterDescription} in the current billing cycle.`)}
    ${tierMessage}
    ${secondary}
    ${button(t, USAGE_LINK, "View Usage")}`
    ),
    usageFooter(t, d.workspaceName, "Manage warning thresholds"),
  ].join("\n");

  return document(t, `Usage Warning – ${d.workspaceName}`, inner);
}

export function renderUsageHardLimitEmail(t: NotificationEmailTheme, d: UsageData): string {
  const [blockedActivity, meterDescription] =
    d.usageItem === "bytes" ? ["data ingestion", "data ingested"] : ["signal runs", "signals cost"];
  const ws = escapeHtml(d.workspaceName);

  const inner = [
    header(
      t,
      `<h1 style="margin:0 0 8px;font-size:${t.titleSize}px;font-weight:${t.titleWeight};color:${t.headerForeground};">Usage Limit Reached</h1>
    <p style="margin:0;font-size:16px;color:${t.severityCritical};">${escapeHtml(d.usageLabel)} hard limit hit &middot; ${blockedActivity} paused</p>`
    ),
    card(
      t,
      `${para(t, `Your workspace <strong>${ws}</strong> has reached its hard limit of <strong>${escapeHtml(d.formattedLimit)}</strong> of ${meterDescription} for the current billing cycle.`)}
    ${para(t, `<strong>From now on, ${blockedActivity} will stop until your billing cycle resets.</strong> To resume sooner, raise or remove this limit from your workspace usage settings.`)}
    ${button(t, USAGE_LINK, "View Usage")}`
    ),
    usageFooter(t, d.workspaceName, "Manage usage limits"),
  ].join("\n");

  return document(t, `Usage Limit Reached – ${d.workspaceName}`, inner);
}
