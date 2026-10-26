import { barY, defineChart, stack, type RectRadius } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";

import { xScale, yScale } from "@/components/chart-builder/charts/cartesian-chart/axes";
import { type XAxisLabels } from "@/components/chart-builder/charts/cartesian-chart/use-x-axis-labels";
import { type TracesStatsDataPoint } from "@/lib/actions/traces/stats-types";

export interface TraceSeriesRow {
  x: string;
  series: "success" | "error";
  value: number;
  success: number;
  error: number;
}

const RADIUS = 4;
const ORDER = ["success", "error"];

export const buildTracesDefinition = (data: TracesStatsDataPoint[], xLabels: XAxisLabels, tickCount: number) => {
  const rows: TraceSeriesRow[] = data.flatMap((point) => [
    {
      x: point.timestamp,
      series: "success",
      value: point.successCount,
      success: point.successCount,
      error: point.errorCount,
    },
    {
      x: point.timestamp,
      series: "error",
      value: point.errorCount,
      success: point.successCount,
      error: point.errorCount,
    },
  ]);
  const highestStack = Math.max(0, ...data.map((point) => point.successCount + point.errorCount));
  const corners = (row: TraceSeriesRow): RectRadius => {
    if (!row.success || !row.error) return RADIUS;
    return row.series === "success" ? [0, 0, RADIUS, RADIUS] : [RADIUS, RADIUS, 0, 0];
  };

  return defineChart({
    marks: [
      crosshair({ x: { band: { fill: "var(--color-emphasis-2)", fillOpacity: 1 } }, y: false }),
      barY(rows, { x: "x", y: "value", color: "series", inset: 0, radius: corners, layout: stack({ order: ORDER }) }),
    ],
    scales: { x: xScale("bar", xLabels, tickCount), y: yScale(highestStack || null) },
    color: { domain: ORDER, range: ["var(--success)", "var(--destructive)"] },
    focus: "group-x",
    focusRing: false,
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      portal,
      anchor: "pointer",
      placement: ["right", "left"],
      offset: 12,
      sort: "color-domain",
      sticky: false,
      className: "ts-dashboard-tooltip",
    },
    svgAnimation: true,
  });
};
