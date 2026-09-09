import type { NotificationEmailTheme } from "../notification-theme";
import { type ClusterData, type EventAlertData, renderEventAlertEmail, renderNewClusterEmail } from "./alert";
import { type ReportData, renderReportEmail } from "./report";
import { renderUsageHardLimitEmail, renderUsageWarningEmail, type UsageData } from "./usage";

export const NOTIFICATION_TEMPLATES = [
  "signal-event",
  "new-cluster",
  "signals-report",
  "usage-warning",
  "usage-hard-limit",
] as const;

export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

const eventAlert: EventAlertData = {
  eventName: "Checkout agent hallucinated a refund policy",
  projectName: "acme-production",
  alertName: "Critical signal events",
  severity: 2,
  attributes: {
    summary: "The agent told the customer refunds are processed in 2 days; the actual policy is 14 days.",
    user_id: "usr_8f21c3",
    model: "gpt-4o-mini",
    confidence: "0.92",
  },
};

const cluster: ClusterData = {
  signalName: "Policy hallucination",
  alertName: "New clusters",
  clusterName: "Refund window misstated",
  numEvents: 34,
  firstSeen: "Mar 1, 2026 09:12 UTC",
  lastSeen: "Mar 4, 2026 17:40 UTC",
  severityCounts: [4, 11, 19],
  examples: [
    {
      name: "Refund policy misquoted",
      timestamp: "Mar 4, 2026 17:40",
      severity: 2,
      summary: "Agent claimed a 2-day refund window on a 14-day policy.",
    },
    {
      name: "Refund eligibility overstated",
      timestamp: "Mar 4, 2026 11:02",
      severity: 1,
      summary: "Agent offered a refund for a non-refundable SKU.",
    },
  ],
};

const report: ReportData = {
  workspaceName: "Acme Inc.",
  periodLabel: "Weekly",
  periodStart: "Aug 30, 2026",
  periodEnd: "Sept 06, 2026",
  totalEvents: 94,
  signals: [
    {
      signalId: "3f1b7a20-1111-4000-8000-00000000aa01",
      signalName: "Failure Detector",
      projectName: "acme-production",
      href: "https://lmnr.ai/project/demo/signals/1",
      summary:
        "Policy hallucinations dominated this week, concentrated in the checkout agent after the Mar 2 prompt change. Tool-call failures fell 18% following the retry fix.",
      eventCount: 45,
      prevEventCount: 39,
      buckets: [12, 18, 9, 22, 14, 27, 19, 31, 24, 17, 29, 21, 35, 26].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][Math.floor(i / 2)],
      })),
      clusters: [
        {
          id: "9c2e5d11-2222-4000-8000-00000000bb01",
          name: "SQL Tool Error",
          count: 45,
          prevCount: 39,
          href: "#",
        },
        {
          id: "4a8f3c99-3333-4000-8000-00000000bb02",
          name: "API Latency Issues",
          count: 34,
          prevCount: 21,
          href: "#",
        },
        {
          id: "1d6b0e44-4444-4000-8000-00000000bb03",
          name: "Step limit reached",
          count: 6,
          prevCount: 18,
          href: "#",
        },
        {
          id: "7e5a2f88-5555-4000-8000-00000000bb04",
          name: "Misformatted bash tool calls",
          count: 9,
          prevCount: 0,
          href: "#",
        },
      ],
    },
    {
      signalId: "6b4c8e30-6666-4000-8000-00000000aa02",
      signalName: "Latency Watch",
      projectName: "acme-staging",
      href: "https://lmnr.ai/project/demo/signals/2",
      summary: "Latency regressed on the staging deploy Thursday; p95 recovered after the connection-pool rollback.",
      eventCount: 49,
      prevEventCount: 61,
      buckets: [8, 14, 22, 11, 19, 7, 25, 13, 9, 30, 16, 12, 6, 18].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][Math.floor(i / 2)],
      })),
      clusters: [
        {
          id: "2f9d7b55-7777-4000-8000-00000000bb05",
          name: "Cold start timeout",
          count: 28,
          prevCount: 12,
          href: "#",
        },
        {
          id: "8c1e4a66-8888-4000-8000-00000000bb06",
          name: "Connection pool exhausted",
          count: 21,
          prevCount: 49,
          href: "#",
        },
      ],
    },
    {
      // Edge: no current events, but a cluster disappeared completely.
      signalId: "00000000-0000-4000-8000-00000000ec01",
      signalName: "Recovered Failure Mode",
      projectName: "acme-production",
      href: "https://lmnr.ai/project/demo/signals/recovered",
      summary:
        "No matching events were detected this period. The authentication-loop cluster dropped from 27 events to zero.",
      eventCount: 0,
      prevEventCount: 27,
      buckets: [0, 0, 0, 0, 0, 0, 0].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][i],
      })),
      clusters: [
        {
          id: "00000000-0000-4000-8000-00000000ec11",
          name: "Authentication retry loop",
          count: 0,
          prevCount: 27,
          href: "https://lmnr.ai/project/demo/clusters/disappeared",
        },
      ],
    },
    {
      // Edge: brand-new signal and brand-new cluster (zero previous baseline).
      signalId: "00000000-0000-4000-8000-00000000ec02",
      signalName: "New Deployment Guard",
      projectName: "acme-canary",
      href: "https://lmnr.ai/project/demo/signals/new",
      summary:
        "This signal was enabled during the current reporting period, so no previous-period baseline is available.",
      eventCount: 7,
      prevEventCount: 0,
      buckets: [0, 0, 0, 0, 0, 2, 5].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][i],
      })),
      clusters: [
        {
          id: "00000000-0000-4000-8000-00000000ec12",
          name: "Unhandled deployment response",
          count: 7,
          prevCount: 0,
          href: "https://lmnr.ai/project/demo/clusters/new",
        },
      ],
    },
    {
      // Edge: sparse series with a single extreme spike and large counts.
      signalId: "00000000-0000-4000-8000-00000000ec03",
      signalName: "Traffic Anomaly Detector",
      projectName: "enterprise-scale-production-us-east-1",
      href: "https://lmnr.ai/project/demo/signals/spike",
      summary:
        "A single retry storm produced nearly all events in this period; surrounding buckets remained at their normal baseline.",
      eventCount: 18492,
      prevEventCount: 241,
      buckets: [1, 0, 2, 1, 0, 18480, 3, 1, 0, 2, 1, 0, 1, 0].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][Math.floor(i / 2)],
      })),
      clusters: [
        {
          id: "00000000-0000-4000-8000-00000000ec13",
          name: "Recursive tool invocation caused by malformed tool-choice fallback",
          count: 18300,
          prevCount: 12,
          href: "https://lmnr.ai/project/demo/clusters/spike",
        },
        {
          id: "00000000-0000-4000-8000-00000000ec14",
          name: "Normal retry exhaustion",
          count: 192,
          prevCount: 229,
          href: "https://lmnr.ai/project/demo/clusters/retries",
        },
      ],
    },
    {
      // Edge: equal absolute movement, HTML escaping, and more than five rows.
      signalId: "00000000-0000-4000-8000-00000000ec04",
      signalName: "Input & Output <Validation>",
      projectName: 'R&D / agents "beta"',
      href: "https://lmnr.ai/project/demo/signals/escaping",
      summary:
        "User-provided labels contain &, <, >, and quotation marks; the renderer must display them as text rather than markup.",
      eventCount: 37,
      prevEventCount: 37,
      buckets: [5, 5, 5, 5, 6, 5, 6].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][i],
      })),
      clusters: [
        { id: "00000000-0000-4000-8000-00000000ec21", name: "Moved up by ten", count: 20, prevCount: 10, href: "#up" },
        {
          id: "00000000-0000-4000-8000-00000000ec22",
          name: "Moved down by ten",
          count: 10,
          prevCount: 20,
          href: "#down",
        },
        {
          id: "00000000-0000-4000-8000-00000000ec23",
          name: 'Quotes: "invalid" & <unsafe>',
          count: 7,
          prevCount: 7,
          href: "#escaped",
        },
        { id: "00000000-0000-4000-8000-00000000ec24", name: "No movement", count: 5, prevCount: 5, href: "#same" },
        { id: "00000000-0000-4000-8000-00000000ec25", name: "Small decrease", count: 3, prevCount: 5, href: "#small" },
        {
          id: "00000000-0000-4000-8000-00000000ec26",
          name: "Sixth row must be truncated",
          count: 1,
          prevCount: 20,
          href: "#sixth",
        },
        {
          id: "00000000-0000-4000-8000-00000000ec27",
          name: "New rows sort after established movers",
          count: 50,
          prevCount: 0,
          href: "#new-last",
        },
      ],
    },
    {
      // Edge: active signal with no named clusters that pass the threshold.
      signalId: "00000000-0000-4000-8000-00000000ec05",
      signalName: "Low-volume Safety Check",
      projectName: "acme-sandbox",
      href: "https://lmnr.ai/project/demo/signals/low-volume",
      summary:
        "A few isolated events occurred, but no named cluster reached the minimum combined-count threshold of five.",
      eventCount: 4,
      prevEventCount: 3,
      buckets: [0, 1, 0, 0, 2, 0, 1].map((value, i) => ({
        value,
        label: ["Aug 30", "Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5"][i],
      })),
      clusters: [
        {
          id: "00000000-0000-4000-8000-00000000ec31",
          name: "Below threshold",
          count: 2,
          prevCount: 1,
          href: "#filtered",
        },
      ],
    },
  ],
};

const usage: UsageData = {
  workspaceName: "Acme AI",
  usageLabel: "Data ingested",
  formattedLimit: "50 GB",
  usageItem: "bytes",
  atTierIncludedAllowance: true,
  tierDisplayName: "Pro",
  overageBillable: true,
};

export function renderNotificationEmail(template: NotificationTemplate, t: NotificationEmailTheme): string {
  switch (template) {
    case "new-cluster":
      return renderNewClusterEmail(t, cluster);
    case "signals-report":
      return renderReportEmail(t, report);
    case "usage-warning":
      return renderUsageWarningEmail(t, usage);
    case "usage-hard-limit":
      return renderUsageHardLimitEmail(t, usage);
    default:
      return renderEventAlertEmail(t, eventAlert);
  }
}
