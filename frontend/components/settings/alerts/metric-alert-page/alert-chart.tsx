"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type MetricAlert, type MetricRulePreview } from "@/lib/actions/alerts/metric-rule";

import RuleChart from "../metric-alerts/rule-chart";

interface AlertChartProps {
  alert: MetricAlert;
  preview?: MetricRulePreview;
  error?: string;
}

/** The last 7 days of a saved rule. A split rule shows one model at a time. */
export default function AlertChart({ alert, preview, error }: AlertChartProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (error) return <p className="rounded-md border p-3 text-sm text-destructive-text">{error}</p>;
  if (!preview) return <Skeleton className="h-72 w-full" />;

  const group =
    preview.groups.find((g) => g.group === selected) ??
    preview.groups.find((g) => alert.firingGroups.includes(g.group)) ??
    preview.groups[0];
  if (!group || group.points.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No data in the last 7 days.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-surface-up p-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">Last 7 days</span>
        {preview.groups.length > 1 && (
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
      <RuleChart rule={alert.rule} group={group} className="h-72" />
      {/* The shading is a replay of the rule as it is now, not the stored incidents. */}
      <p className="text-xs text-muted-foreground">
        Shaded spans are when this rule fires on the stored data, including time before it was created or last edited.
      </p>
    </div>
  );
}
