import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { type WebNotification } from "@/lib/actions/notifications";

interface ReportClusterPayload {
  id: string;
  name: string;
  count: number;
  previous_count: number;
}

interface SignalReportPayload {
  signal_id: string;
  signal_name: string;
  current_count: number;
  previous_count: number;
  summary?: string;
  clusters: ReportClusterPayload[];
}

interface SignalsReportPayload {
  workspace_name: string;
  project_id: string;
  project_name: string;
  title: string;
  period_label: string;
  period_start: string;
  period_end: string;
  signal_event_counts: Record<string, number>;
  /** Missing on reports queued before per-signal data existed. */
  signals?: SignalReportPayload[];
}

interface EventIdentificationPayload {
  project_id: string;
  signal_id: string;
  trace_id: string;
  event_id: string | null;
  event_name: string;
  severity: number;
  extracted_information: Record<string, unknown> | null;
  alert_name: string;
}

interface NewClusterPayload {
  project_id: string;
  signal_id: string;
  signal_name: string;
  cluster_id: string;
  cluster_name: string;
  num_signal_events: number;
  alert_name: string;
  first_seen?: string | null;
  last_seen?: string | null;
  reopened?: boolean;
}

interface BaseNotification {
  title: string;
  summary: string;
}

export interface NewEventNotification extends BaseNotification {
  kind: "alert";
  extractedFields: [string, string][];
  traceLink: string;
  similarEventsLink: string | null;
  severity: number;
}

export interface NewClusterNotification extends BaseNotification {
  kind: "cluster";
  clusterLink: string;
  details: [string, string][];
}

interface ReportCluster {
  name: string;
  count: number;
  previousCount: number;
  link: string;
}

export interface ReportSignal {
  name: string;
  count: number;
  /** Null for legacy reports, which carry only per-signal totals. */
  previousCount: number | null;
  summary: string | null;
  link: string | null;
  clusters: ReportCluster[];
}

export interface ReportNotification extends BaseNotification {
  kind: "report";
  signals: ReportSignal[];
}

export type FormattedNotification = NewEventNotification | NewClusterNotification | ReportNotification;

const formatNewClusterPayload = (cluster: NewClusterPayload): NewClusterNotification => {
  const details: [string, string][] = [
    ["Name", cluster.cluster_name],
    ["Events", String(cluster.num_signal_events)],
  ];
  if (cluster.first_seen) {
    details.push(["First seen", cluster.first_seen]);
  }
  if (cluster.last_seen) {
    details.push(["Last seen", cluster.last_seen]);
  }

  return {
    kind: "cluster",
    title: cluster.signal_name,
    summary: cluster.reopened ? "New events in a resolved cluster" : "New cluster",
    clusterLink: `/project/${cluster.project_id}/signals/${cluster.signal_id}?clusterId=${cluster.cluster_id}`,
    details,
  };
};

const formatAlertNotification = (notification: WebNotification): FormattedNotification | null => {
  try {
    const payload: { EventIdentification?: EventIdentificationPayload; NewCluster?: NewClusterPayload } = JSON.parse(
      notification.payload
    );

    if (payload.NewCluster) {
      return formatNewClusterPayload(payload.NewCluster);
    }

    const event = payload.EventIdentification;
    if (!event) return null;

    // Do not show notification if severity is not specified (historical data)
    if (event.severity == null) return null;

    const severity = event.severity;

    const extractedFields: [string, string][] = event.extracted_information
      ? Object.entries(event.extracted_information).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
      : [];

    const similarEventsLink = event.event_id
      ? `/project/${event.project_id}/signals/${event.signal_id}?eventCluster=${event.event_id}`
      : null;

    const severityLabel = SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? "Unknown";

    return {
      kind: "alert",
      title: `${event.event_name}`,
      summary: `New ${severityLabel} event`,
      extractedFields,
      traceLink: `/project/${event.project_id}/traces/${event.trace_id}?chat=true`,
      similarEventsLink,
      severity,
    };
  } catch {
    return null;
  }
};

const clusterChangeScore = (c: ReportClusterPayload) =>
  Math.abs((c.count - c.previous_count) / Math.sqrt(c.count + c.previous_count));

// Mirrors `SignalReportData::notable_clusters` in app-server/src/reports/report_data.rs so the
// panel lists the same clusters as the email and Slack reports.
const notableClusters = (clusters: ReportClusterPayload[]): ReportClusterPayload[] =>
  clusters
    .filter((c) => c.count + c.previous_count >= 5)
    .sort((a, b) => {
      const aNew = a.previous_count === 0;
      const bNew = b.previous_count === 0;
      if (aNew !== bNew) return aNew ? 1 : -1;
      return clusterChangeScore(b) - clusterChangeScore(a);
    })
    .slice(0, 5);

const formatReportSignals = (report: SignalsReportPayload): ReportSignal[] => {
  if (!report.signals?.length) {
    return Object.entries(report.signal_event_counts)
      .map(([name, count]) => ({ name, count, previousCount: null, summary: null, link: null, clusters: [] }))
      .sort((a, b) => b.count - a.count);
  }

  return [...report.signals]
    .sort((a, b) => b.current_count - a.current_count)
    .map((signal) => {
      const signalLink = `/project/${report.project_id}/signals/${signal.signal_id}`;
      return {
        name: signal.signal_name,
        count: signal.current_count,
        previousCount: signal.previous_count,
        summary: signal.summary || `${signal.current_count} events were detected during this period.`,
        link: signalLink,
        clusters: notableClusters(signal.clusters ?? []).map((c) => ({
          name: c.name,
          count: c.count,
          previousCount: c.previous_count,
          link: `${signalLink}?clusterId=${c.id}`,
        })),
      };
    });
};

const formatReportNotification = (notification: WebNotification): FormattedNotification | null => {
  try {
    const payload: { SignalsReport: SignalsReportPayload } = JSON.parse(notification.payload);
    const report = payload.SignalsReport;
    if (!report) {
      return null;
    }

    const periodStartMs = new Date(report.period_start).getTime();
    const periodEndMs = new Date(report.period_end).getTime();

    // Hide weekly-style rollups to avoid duplicating info already shown by daily reports.
    if (!Number.isNaN(periodStartMs) && !Number.isNaN(periodEndMs)) {
      const periodDays = (periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24);
      if (periodDays > 3) {
        return null;
      }
    }

    const events = Object.values(report.signal_event_counts).reduce((a, b) => a + b, 0);
    const signalCount = Object.keys(report.signal_event_counts).length;

    const titlePrefix = (() => {
      if (Number.isNaN(periodStartMs) || Number.isNaN(periodEndMs)) {
        return "Events";
      }
      const diffDays = Math.max(1, Math.round((periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24)));
      if (diffDays === 1) return "Daily events";
      return `${diffDays}-day events`;
    })();

    return {
      kind: "report",
      title: `${titlePrefix} summary`,
      summary: `${signalCount} signal${signalCount !== 1 ? "s" : ""} · ${events} event${events !== 1 ? "s" : ""}`,
      signals: formatReportSignals(report),
    };
  } catch {
    return null;
  }
};

export const formatNotification = (notification: WebNotification): FormattedNotification | null => {
  if (notification.definitionType === "ALERT") {
    return formatAlertNotification(notification);
  }
  if (notification.definitionType === "REPORT") {
    return formatReportNotification(notification);
  }
  return null;
};
