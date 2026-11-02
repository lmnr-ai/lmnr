import { type BandScale, scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { type PointScale, scalePoint } from "@tanstack/charts/scales/point";

import { numberFormatter } from "@/lib/charts/format";
import { selectNiceTicksFromData } from "@/lib/charts/time";
import { fixedCountTicks } from "@/lib/charts/y-ticks";

import { type XAxisLabels } from "./use-x-axis-labels";

// Px per time tick; TanStack asks for floor(axis width / this) of them (≈16 on a 1536px card, like
// TimeSeriesChart's breakpoints).
const X_TICK_SPACING = 96;
const Y_TICK_COUNT = 5;
// Recharts' `text-xs`; TanStack defaults to 11px.
const TICK_LABELS = { fontSize: 12 };
// Label distance from the plot; TanStack's 4px lets the y "0" and the first x label touch in the corner.
const TICK_PADDING = 8;
// Minimum px between x labels; TanStack's default 4px packs them edge to edge. Being in pixels, it
// thins narrow cards harder without measuring them.
const X_LABEL_GAP = 24;

const MUTED = "var(--color-muted-foreground)";
const GRID = "color-mix(in srgb, var(--color-border) 50%, transparent)";

/**
 * A category scale that answers TanStack's `ticks(count)` with round times snapped to data points.
 * TanStack derives `count` from the axis width and `spacing`, so the ticks fit the card without us
 * measuring it; a fixed candidate list would instead be thinned into uneven gaps and odd intervals.
 */
const withTimeTicks = <S extends BandScale<string> | PointScale<string>>(scale: S): S => {
  const copy = scale.copy.bind(scale) as () => S;
  return Object.assign(scale, {
    ticks: (count: number) => selectNiceTicksFromData(scale.domain(), count)?.ticks ?? scale.domain(),
    tickFormat: (count: number) => selectNiceTicksFromData(scale.domain(), count)?.formatter ?? String,
    copy: () => withTimeTicks(copy()),
  });
};

export const xScale = (kind: "line" | "bar", labels: XAxisLabels) => {
  const category = kind === "line" ? () => scalePoint<string>() : () => scaleBand<string>().padding(0.1);
  return {
    scale: labels.time ? () => withTimeTicks(category()) : category,
    axis: {
      ticks: {
        size: 0,
        padding: TICK_PADDING,
        fill: MUTED,
        // A `format` would override the scale's `tickFormat`, whose labels match the ticks it picked.
        ...(labels.time ? { spacing: X_TICK_SPACING } : { format: labels.formatTick }),
      },
      tickLabels: { ...TICK_LABELS, thin: { minGap: X_LABEL_GAP } },
      line: false,
    },
  };
};

/** `max` is the tallest point or stack; null (negative or all-zero data) keeps TanStack's nice ticks. */
export const yScale = (max: number | null) => {
  const values = max === null ? undefined : fixedCountTicks(max, Y_TICK_COUNT);
  return {
    scale: values ? scaleLinear().domain([0, values.at(-1)!]) : scaleLinear,
    nice: !values,
    grid: { stroke: GRID, strokeOpacity: 1 },
    axis: {
      ticks: {
        size: 0,
        padding: TICK_PADDING,
        ...(values ? { values } : { count: Y_TICK_COUNT }),
        format: (v: number) => numberFormatter.format(v),
        fill: MUTED,
      },
      tickLabels: TICK_LABELS,
      line: false,
    },
  };
};
