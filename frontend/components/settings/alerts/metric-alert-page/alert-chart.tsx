"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";

import { CHART_RANGE_KEYS, CHART_RANGES, DEFAULT_CHART_RANGE, REFRESH_MS } from "../metric-alerts/constants";
import RuleChart from "../metric-alerts/rule-chart";
import { useRulePreview } from "../metric-alerts/use-rule-requests";
import RangePicker from "./range-picker";

const rangeParser = parseAsStringLiteral(CHART_RANGE_KEYS).withDefault(DEFAULT_CHART_RANGE);

/** A saved rule over the picked range, refreshed while the page is open. A split rule shows one model at a time. */
export default function AlertChart({ alert }: { alert: MetricAlert }) {
  const [range, setRange] = useQueryState("range", rangeParser);
  const [selected, setSelected] = useState<string | null>(null);
  const { preview, error } = useRulePreview(alert.projectId, alert.rule, {
    hours: CHART_RANGES[range],
    alertId: alert.id,
    refreshMs: REFRESH_MS,
  });

  const group =
    preview?.groups.find((g) => g.group === selected) ??
    preview?.groups.find((g) => alert.firingGroups.includes(g.group)) ??
    preview?.groups[0];

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-surface-up p-3">
      <div className="flex items-center justify-between gap-4">
        <RangePicker value={range} onChange={setRange} />
        {preview && preview.groups.length > 1 && group && (
          <Select value={group.group} onValueChange={setSelected}>
            <SelectTrigger className="h-7 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {preview.groups.map((g) => (
                <SelectItem key={g.group} value={g.group}>
                  {g.group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {error ? (
        <p className="rounded-md border p-3 text-sm text-destructive-text">{error}</p>
      ) : !preview ? (
        <Skeleton className="h-72 w-full" />
      ) : !group || group.points.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No data in this range.
        </p>
      ) : (
        <RuleChart rule={alert.rule} group={group} className="h-72" />
      )}
      {/* The shading is a replay of the rule as it is now, not the stored incidents. */}
      <p className="text-xs text-muted-foreground">
        Shaded spans are when this rule fires on the stored data, including time before it was created or last edited.
      </p>
    </div>
  );
}
