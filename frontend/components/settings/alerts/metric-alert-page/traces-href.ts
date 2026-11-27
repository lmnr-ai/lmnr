import { createSerializer, parseAsString } from "nuqs";

import { type MetricAlertIncident, type MetricRule, type RuleCadence } from "@/lib/actions/alerts/metric-rule";
import { parseUtcTimestamp } from "@/lib/charts/time";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const serializeTracesQuery = createSerializer({
  startDate: parseAsString,
  endDate: parseAsString,
  sortBy: parseAsString,
  sortDirection: parseAsString,
});

/** The traces table over a time range, most expensive first. */
export const tracesHref = (projectId: string, from: Date, to: Date): string =>
  `/project/${projectId}/traces${serializeTracesQuery({
    startDate: from.toISOString(),
    endDate: to.toISOString(),
    sortBy: "cost",
    sortDirection: "desc",
  })}`;

/**
 * The traces behind an incident, until it resolved. The range starts
 * `firesAfterMinutes` and one window before the incident opened, which covers
 * the first window that breached with up to one check interval to spare.
 * `null` while the rule's cadence is not known, so no link shows a range that is too short.
 */
export const incidentTracesHref = (
  projectId: string,
  rule: Pick<MetricRule, "window">,
  incident: Pick<MetricAlertIncident, "openedAt" | "resolvedAt">,
  cadence: Pick<RuleCadence, "firesAfterMinutes"> | undefined,
  now = new Date()
): string | null => {
  const opened = parseUtcTimestamp(incident.openedAt);
  const to = incident.resolvedAt ? parseUtcTimestamp(incident.resolvedAt) : now;
  if (!cadence) return null;
  const lead = (cadence.firesAfterMinutes + rule.window.minutes) * MINUTE_MS;
  return tracesHref(projectId, new Date(opened.getTime() - lead), to);
};

/** The last day of traces, for a rule with no open incident. */
export const currentTracesHref = (projectId: string, now = new Date()): string =>
  tracesHref(projectId, new Date(now.getTime() - DAY_MS), now);
