import { barY, defineChart, lineY, type RectRadius, stack } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { cursorHost } from "@tanstack/charts/cursor";
import { tooltip } from "@tanstack/charts/tooltip";
import { portal } from "@tanstack/charts/tooltip/portal";

import { xScale, yScale } from "./axes";
import { dashboardCursor } from "./dashboard-cursor";
import { type XAxisLabels } from "./use-x-axis-labels";

export interface SeriesRow {
  x: string;
  series: string;
  value: number;
}

interface DefinitionOptions {
  kind: "line" | "bar";
  rows: SeriesRow[];
  /** Series in palette order, so each gets its chartConfig colour. */
  keys: string[];
  /** Bottom-to-top stack order: largest total first. */
  stackOrder: string[];
  colors: string[];
  xLabels: XAxisLabels;
}

const RADIUS = 4;
const LINE_WIDTH = 1.5;
const BAR_OPACITY = 0.7;

// Rounds each stack's top and bottom; TanStack's `stack: "outer"` only rounds the top.
const stackCorners = (rows: SeriesRow[], stackOrder: string[]) => {
  const rank = new Map(stackOrder.map((key, i) => [key, i]));
  const byX = Map.groupBy(
    rows.filter((row) => row.value !== 0),
    (row) => row.x
  );
  const corners = new Map<SeriesRow, RectRadius>();
  for (const stackRows of byX.values()) {
    stackRows.sort((a, b) => rank.get(a.series)! - rank.get(b.series)!);
    const [bottom, top] = [stackRows[0], stackRows.at(-1)!];
    corners.set(bottom, [0, 0, RADIUS, RADIUS]);
    corners.set(top, bottom === top ? RADIUS : [RADIUS, RADIUS, 0, 0]);
  }
  return corners;
};

// Tallest stack (bar) or point (line); null when negative or all-zero data leaves y ticks to TanStack.
const yMax = (kind: DefinitionOptions["kind"], rows: SeriesRow[]) => {
  if (rows.some((row) => row.value < 0)) return null;
  const heights =
    kind === "bar"
      ? [...Map.groupBy(rows, (row) => row.x).values()].map((stack) => stack.reduce((sum, row) => sum + row.value, 0))
      : rows.map((row) => row.value);
  const max = Math.max(0, ...heights);
  return max > 0 ? max : null;
};

export const buildDefinition = ({ kind, rows, keys, stackOrder, colors, xLabels }: DefinitionOptions) => {
  const corners = kind === "bar" ? stackCorners(rows, stackOrder) : new Map<SeriesRow, RectRadius>();
  const marks =
    kind === "line"
      ? [
          crosshair({ x: { stroke: "var(--color-foreground-500)", strokeOpacity: 1 }, y: false }),
          lineY(rows, { x: "x", y: "value", color: "series", strokeWidth: LINE_WIDTH }),
        ]
      : [
          // Before the bars so the hover band paints underneath them.
          crosshair({ x: { band: { fill: "var(--color-emphasis-2)", fillOpacity: 1 } }, y: false }),
          barY(rows, {
            x: "x",
            y: "value",
            color: "series",
            inset: 0,
            radius: (row) => corners.get(row) ?? 0,
            fillOpacity: BAR_OPACITY,
            layout: stack({ order: stackOrder }),
          }),
        ];

  return defineChart({
    marks,
    scales: { x: xScale(kind, xLabels), y: yScale(yMax(kind, rows)) },
    color: { domain: keys, range: colors },
    focus: "group-x",
    focusRing: false,
    maxFocusDistance: Number.POSITIVE_INFINITY,
    // The card clips its overflow, so the tooltip escapes to the top layer.
    tooltip: {
      use: tooltip,
      portal,
      // Linked charts have no pointer, so they fall back to their focused point.
      anchor: "pointer",
      placement: ["right", "left"],
      offset: 12,
      sort: "color-domain",
      sticky: false,
      className: "ts-dashboard-tooltip",
    },
    cursor: { use: cursorHost, controller: dashboardCursor, mode: "focus", match: "x" },
    svgAnimation: true,
  });
};
