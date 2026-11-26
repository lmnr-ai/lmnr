"use client";

import { useMemo } from "react";
import { Line, LineChart, ReferenceLine, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";
import { cn } from "@/lib/utils";

import { CARD_CHART_HOURS, REFRESH_MS } from "./constants";
import { LEVEL_COLORS, SERIES_COLOR, thresholdLines, toRows, yDomain } from "./rule-chart/series";
import { useRulePreview } from "./use-rule-requests";

/** The last 6 hours of a saved rule, with its first alerting threshold. */
export default function Sparkline({ alert, className }: { alert: MetricAlert; className?: string }) {
  const { preview } = useRulePreview(alert.projectId, alert.rule, {
    hours: CARD_CHART_HOURS,
    alertId: alert.id,
    refreshMs: REFRESH_MS,
  });
  // A split rule shows the group that is firing, or else its largest one.
  const group = preview?.groups.find((g) => alert.firingGroups.includes(g.group)) ?? preview?.groups[0];
  const rows = useMemo(() => (group ? toRows(group) : []), [group]);
  const lines = useMemo(() => thresholdLines(alert.rule).filter((line) => line.key !== "resolve"), [alert.rule]);
  const first = lines.at(-1);

  if (rows.length === 0) return <div className={cn("h-12 w-full", className)} />;

  return (
    <ChartContainer
      config={{}}
      className={cn("aspect-auto h-12 w-full", className)}
      aria-label={`Last ${CARD_CHART_HOURS} hours`}
    >
      <LineChart data={rows} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={yDomain(rows, first ? [first] : [])} />
        {first && <ReferenceLine y={first.value} style={{ stroke: LEVEL_COLORS[first.key] }} strokeDasharray="3 3" />}
        <Line dataKey="value" stroke={SERIES_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}
