"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { type PreviewGroup } from "@/lib/actions/alerts/metric-rule";
import { cn } from "@/lib/utils";

import { formatRuleValue } from "../utils";
import ChartTooltip from "./chart-tooltip";
import {
  type ChartRule,
  dayTicks,
  incidentBands,
  LEVEL_COLORS,
  SERIES_COLOR,
  thresholdLines,
  toRows,
  yDomain,
} from "./series";
import ThresholdLegend from "./threshold-legend";

const DAY_MS = 24 * 60 * 60 * 1000;
const TICK = { fontSize: 12, fill: "var(--color-muted-foreground)" };

interface RuleChartProps {
  rule: ChartRule;
  group: PreviewGroup;
  className?: string;
}

/** A rule's value over time with its thresholds drawn across and its incidents shaded. */
export default function RuleChart({ rule, group, className }: RuleChartProps) {
  const rows = useMemo(() => toRows(group), [group]);
  const lines = useMemo(() => thresholdLines(rule), [rule]);
  const bands = useMemo(() => incidentBands(group, rows), [group, rows]);
  const span = rows.length > 1 ? rows[rows.length - 1].at - rows[0].at : 0;
  const hasProjection = rows.some((row) => row.projected != null);

  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={{}} className={cn("aspect-auto h-56 w-full", className)}>
        <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            type="number"
            dataKey="at"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={span > 2 * DAY_MS ? dayTicks(rows[0].at, rows[rows.length - 1].at) : undefined}
            tickFormatter={(at: number) => format(at, span > DAY_MS ? "MMM d" : "HH:mm")}
            minTickGap={48}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={TICK}
          />
          <YAxis
            width="auto"
            domain={yDomain(rows, lines)}
            tickCount={4}
            tickFormatter={(value: number) => formatRuleValue(rule, value)}
            tickLine={false}
            axisLine={false}
            tick={TICK}
          />
          {bands.map((band) => (
            <ReferenceArea
              key={band.from}
              x1={band.from}
              x2={band.to}
              fill={band.critical ? LEVEL_COLORS.critical : LEVEL_COLORS.warning}
              fillOpacity={0.12}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
          ))}
          {lines.map((line) => (
            <ReferenceLine
              key={line.key}
              y={line.value}
              // ChartContainer paints every reference line in the border colour; the style wins over it.
              style={{ stroke: LEVEL_COLORS[line.key] }}
              strokeDasharray={line.key === "resolve" ? "2 4" : "6 4"}
            />
          ))}
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--color-muted-foreground)", strokeOpacity: 0.4 }}
            content={<ChartTooltip rule={rule} />}
          />
          <Line
            dataKey="value"
            stroke={SERIES_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          {hasProjection && (
            <Line
              dataKey="projected"
              stroke={SERIES_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ChartContainer>
      <ThresholdLegend lines={lines} hasProjection={hasProjection} />
    </div>
  );
}
