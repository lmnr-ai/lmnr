import { format, formatDistanceStrict, formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";

import { type MetricAlertIncident, type MetricRule } from "@/lib/actions/alerts/metric-rule";
import { parseUtcTimestamp } from "@/lib/charts/time";

import StatusPill from "../metric-alerts/status-pill";
import { formatRuleValue } from "../metric-alerts/utils";
import { incidentTracesHref } from "./traces-href";

interface IncidentHistoryProps {
  projectId: string;
  rule: MetricRule;
  incidents: MetricAlertIncident[];
  firesAfterMinutes: number;
}

const time = (value: string | null) => (value ? format(parseUtcTimestamp(value), "MMM d, HH:mm") : "-");

const LEVEL_LABEL = { ok: "OK", warning: "Warning", critical: "Critical" } as const;

export default function IncidentHistory({ projectId, rule, incidents, firesAfterMinutes }: IncidentHistoryProps) {
  if (incidents.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No incidents yet. One opens when the rule fires.
      </p>
    );
  }
  const split = rule.groupBy === "model";

  return (
    <div className="overflow-x-auto rounded-md border bg-surface-up">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <th>Opened</th>
            {split && <th>Model</th>}
            <th>Peak</th>
            <th>Escalated</th>
            <th>Resolved</th>
            <th>Duration</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y">
          {incidents.map((incident) => {
            const opened = parseUtcTimestamp(incident.openedAt);
            return (
              <tr key={incident.id} className="[&>td]:px-3 [&>td]:py-2 [&>td]:whitespace-nowrap">
                <td>{time(incident.openedAt)}</td>
                {split && <td className="max-w-48 truncate">{incident.group}</td>}
                <td>
                  <span className="flex items-center gap-2">
                    <StatusPill status={{ label: LEVEL_LABEL[incident.peakLevel], tone: incident.peakLevel }} />
                    <span className="tabular-nums">{formatRuleValue(rule, incident.peakValue)}</span>
                  </span>
                </td>
                <td>{time(incident.escalatedAt)}</td>
                <td>{incident.resolvedAt ? time(incident.resolvedAt) : "Open"}</td>
                <td className="tabular-nums">
                  {incident.resolvedAt
                    ? formatDistanceStrict(parseUtcTimestamp(incident.resolvedAt), opened)
                    : formatDistanceToNowStrict(opened)}
                </td>
                <td className="text-right">
                  <Link
                    href={incidentTracesHref(projectId, rule, incident, firesAfterMinutes)}
                    className="text-xs text-primary-text hover:underline"
                  >
                    Open traces
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
