import { type MetricAlertIncident, type MetricRule, type RuleCadence } from "@/lib/actions/alerts/metric-rule";
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
 * `null` while the rule's cadence is not known, so no link shows a range that is too short.
 */
export const incidentTracesHref = (
  projectId: string,
  rule: MetricRule,
  incident: Pick<MetricAlertIncident, "openedAt" | "resolvedAt">,
  cadence: Pick<RuleCadence, "firesAfterMinutes"> | undefined,
  now = new Date()
): string | null => {
  const opened = parseUtcTimestamp(incident.openedAt);
  const to = incident.resolvedAt ? parseUtcTimestamp(incident.resolvedAt) : now;
  if (!("minutes" in rule.window)) {
    return tracesHref(projectId, rule, new Date(Date.UTC(opened.getUTCFullYear(), opened.getUTCMonth(), 1)), to);
  }
  if (!cadence) return null;
  const lead = (cadence.firesAfterMinutes + rule.window.minutes) * MINUTE_MS;
  return tracesHref(projectId, rule, new Date(opened.getTime() - lead), to);
};

export const lastDayTracesHref = (projectId: string, rule: MetricRule, now = new Date()): string =>
  tracesHref(projectId, rule, new Date(now.getTime() - DAY_MS), now);
