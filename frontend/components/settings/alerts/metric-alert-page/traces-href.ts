import { type MetricAlertIncident, type MetricRule } from "@/lib/actions/alerts/metric-rule";
import { parseUtcTimestamp } from "@/lib/charts/time";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The traces table over a time range, narrowed by the rule's filters, most expensive first. */
export const tracesHref = (projectId: string, rule: MetricRule, from: Date, to: Date): string => {
  const query = new URLSearchParams({ startDate: from.toISOString(), endDate: to.toISOString() });
  // The traces table reads `filter` as one comma-separated list, with the
  // commas inside each filter escaped.
  if (rule.filters.length > 0) {
    query.set("filter", rule.filters.map((filter) => JSON.stringify(filter).replaceAll(",", "%2C")).join(","));
  }
  query.set("sortBy", "cost");
  query.set("sortDirection", "desc");
  return `/project/${projectId}/traces?${query.toString()}`;
};

/**
 * The traces behind an incident: from the first window that breached, which
 * ended `firesAfterMinutes` before the incident opened, until it resolved.
 * A month-to-date rule counts spend from the start of the UTC month.
 */
export const incidentTracesHref = (
  projectId: string,
  rule: MetricRule,
  incident: Pick<MetricAlertIncident, "openedAt" | "resolvedAt">,
  firesAfterMinutes: number,
  now = new Date()
): string => {
  const opened = parseUtcTimestamp(incident.openedAt);
  const from =
    "minutes" in rule.window
      ? new Date(opened.getTime() - (firesAfterMinutes + rule.window.minutes) * MINUTE_MS)
      : new Date(Date.UTC(opened.getUTCFullYear(), opened.getUTCMonth(), 1));
  return tracesHref(projectId, rule, from, incident.resolvedAt ? parseUtcTimestamp(incident.resolvedAt) : now);
};

export const lastDayTracesHref = (projectId: string, rule: MetricRule, now = new Date()): string =>
  tracesHref(projectId, rule, new Date(now.getTime() - DAY_MS), now);
