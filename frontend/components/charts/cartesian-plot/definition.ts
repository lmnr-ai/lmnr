import { barY, defineChart, lineY, type RectRadius, stack } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { cursorHost } from "@tanstack/charts/cursor";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";

import { xScale, yScale } from "./axes";
import { linkedCursorController } from "./linked-cursor";
import { type PlotSeries } from "./types";
import { type XAxisLabels } from "./use-x-axis-labels";

export interface SeriesRow {
  x: string;
  series: string;
  value: number;
}

interface DefinitionOptions {
  kind: "line" | "bar";
  rows: SeriesRow[];
  series: PlotSeries[];
  xLabels: XAxisLabels;
  stackOrder?: readonly string[];
  markers?: boolean;
  linkedCursor?: boolean;
}

const RADIUS = 4;

const stackCorners = (rows: SeriesRow[], order: readonly string[]) => {
  const rank = new Map(order.map((key, index) => [key, index]));
  const byX = Map.groupBy(
    rows.filter((row) => row.value !== 0),
    (row) => row.x
  );
  const corners = new Map<SeriesRow, RectRadius>();
  for (const stackRows of byX.values()) {
    stackRows.sort((a, b) => (rank.get(a.series) ?? 0) - (rank.get(b.series) ?? 0));
    const bottom = stackRows[0];
    const top = stackRows.at(-1)!;
    corners.set(bottom, [0, 0, RADIUS, RADIUS]);
    corners.set(top, bottom === top ? RADIUS : [RADIUS, RADIUS, 0, 0]);
  }
  return corners;
};

const yMax = (kind: DefinitionOptions["kind"], rows: SeriesRow[]) => {
  if (rows.some((row) => row.value < 0)) return null;
  const heights =
    kind === "bar"
      ? [...Map.groupBy(rows, (row) => row.x).values()].map((group) => group.reduce((sum, row) => sum + row.value, 0))
      : rows.map((row) => row.value);
  const max = Math.max(0, ...heights);
  return max > 0 ? max : null;
};

export const buildDefinition = ({
  kind,
  rows,
  series,
  xLabels,
  stackOrder,
  markers,
  linkedCursor,
}: DefinitionOptions) => {
  const keys = series.map((item) => item.key);
  const totals = new Map(
    keys.map((key) => [key, rows.reduce((sum, row) => sum + (row.series === key ? row.value : 0), 0)])
  );
  const order = stackOrder ?? [...keys].sort((a, b) => totals.get(b)! - totals.get(a)!);
  const corners = kind === "bar" ? stackCorners(rows, order) : new Map<SeriesRow, RectRadius>();
  const marks =
    kind === "line"
      ? [
          crosshair({ x: { stroke: "var(--color-foreground-500)", strokeOpacity: 1 }, y: false }),
          lineY(rows, { x: "x", y: "value", color: "series", strokeWidth: 1.5 }),
        ]
      : [
          crosshair({ x: { band: { fill: "var(--color-emphasis-2)", fillOpacity: 1 } }, y: false }),
          barY(rows, {
            x: "x",
            y: "value",
            color: "series",
            inset: 0,
            radius: (row) => corners.get(row) ?? 0,
            layout: stack({ order }),
          }),
        ];

  return defineChart({
    marks,
    ...(markers ? { margin: { top: 30 } } : {}),
    scales: { x: xScale(kind, xLabels), y: yScale(yMax(kind, rows)) },
    color: { domain: keys, range: series.map((item) => item.color) },
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
    ...(linkedCursor
      ? { cursor: { use: cursorHost, controller: linkedCursorController, mode: "focus", match: "x" } }
      : {}),
    svgAnimation: false,
  });
};
