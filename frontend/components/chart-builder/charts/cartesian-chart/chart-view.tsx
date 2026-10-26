"use client";

import { type ChartPoint } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react/tooltip";
import { useMemo, useRef, useState } from "react";

import "./styles.css";

import { type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { buildDefinition, type SeriesRow } from "./definition";
import FocusDots from "./focus-dots";
import TooltipBody from "./tooltip-body";
import { type DragSelection } from "./use-drag-selection";
import { useResizing } from "./use-resizing";
import { useXAxisLabels } from "./use-x-axis-labels";

export interface ChartViewProps {
  kind: "line" | "bar";
  /** Wide rows: one column per series, gaps already filled with zero. */
  data: Record<string, any>[];
  x: string;
  keys: string[];
  chartConfig: ChartConfig;
  /** Present on dashboards, where dragging selects a time range. */
  selection?: DragSelection;
}

/** Draws a line or stacked bar chart with TanStack Charts. */
const ChartView = ({ kind, data, x, keys, chartConfig, selection }: ChartViewProps) => {
  const xLabels = useXAxisLabels(data, x);

  const { rows, stackOrder } = useMemo(() => {
    const totals = new Map(keys.map((key) => [key, data.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)]));
    return {
      rows: data.flatMap((row) =>
        keys.map((key): SeriesRow => ({ x: String(row[x]), series: key, value: Number(row[key]) || 0 }))
      ),
      stackOrder: [...keys].sort((a, b) => totals.get(b)! - totals.get(a)!),
    };
  }, [data, x, keys]);

  const [focused, setFocused] = useState<readonly ChartPoint<SeriesRow, string, number>[]>([]);
  const container = useResizing<HTMLDivElement>();
  // Linked hover focuses every chart at once; only the hovered one shows a tooltip, or off-screen
  // charts' tooltips (portaled to body) pile up over the header.
  const hovered = useRef(false);
  // The chart unmounts while resizing, so its focus points would be stale when it comes back.
  if (container.resizing && focused.length > 0) setFocused([]);

  const definition = useMemo(
    () =>
      buildDefinition({
        kind,
        rows,
        keys,
        stackOrder,
        colors: keys.map((key) => chartConfig[key]?.color ?? "currentColor"),
        xLabels,
      }),
    [kind, rows, keys, stackOrder, chartConfig, xLabels]
  );

  // The wrapper takes its size from the card's flex layout, so it follows a resize freely while the
  // chart sits it out and draws once at the final size.
  return (
    <div ref={container.ref} className="relative mt-1 min-h-0 w-full flex-1 text-xs [&_*:focus]:outline-none">
      {!container.resizing && (
        <div
          className="absolute inset-0 animate-in fade-in duration-200"
          onPointerEnter={() => (hovered.current = true)}
          onPointerLeave={() => (hovered.current = false)}
          onPointerDown={selection?.onPointerDown}
          style={selection ? { userSelect: "none", cursor: "crosshair" } : undefined}
        >
          <Chart
            definition={definition}
            ariaLabel="chart"
            style={{ height: "100%" }}
            onFocusChange={selection?.onFocusChange}
            onFocusGroupChange={kind === "line" ? setFocused : undefined}
            onRender={selection?.onRender}
            renderTooltipBody={({ points }) =>
              hovered.current ? <TooltipBody points={points} formatX={xLabels.formatTooltip} /> : null
            }
          />
          {kind === "line" && <FocusDots points={focused} />}
          {selection?.overlay && (
            <div
              className="pointer-events-none absolute border border-primary/50 bg-primary/30"
              style={selection.overlay}
            />
          )}
        </div>
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-md bg-emphasis-1 transition-opacity duration-200",
          container.resizing ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
};

export default ChartView;
