"use client";

import { useCallback } from "react";

import CartesianPlot, { type PlotSeries } from "@/components/charts/cartesian-plot";
import { type PlotRange } from "@/components/charts/cartesian-plot/types";
import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";

import { useResizing } from "./use-resizing";

/** Dashboard-owned persistence, linked hover and resize behaviour stay outside the plot. */
const SelectableChart = ({
  chartId,
  kind,
  data,
  x,
  series,
}: {
  chartId: string;
  kind: "line" | "bar";
  data: Record<string, any>[];
  x: string;
  series: PlotSeries[];
}) => {
  const { owner, start, end, startDrag, updateDrag, endDrag } = useDashboardSelectionStore((state) => ({
    owner: state.chartId,
    start: state.startLabel,
    end: state.endLabel,
    startDrag: state.startDrag,
    updateDrag: state.updateDrag,
    endDrag: state.endDrag,
  }));
  const onChange = useCallback(
    (range: PlotRange, phase: "start" | "move" | "end") => {
      if (phase === "start") startDrag(chartId, range.start);
      else if (phase === "move") updateDrag(range.end);
      else endDrag();
    },
    [chartId, startDrag, updateDrag, endDrag]
  );
  const resizing = useResizing<HTMLDivElement>();
  return (
    <div ref={resizing.ref} className="relative mt-1 min-h-0 w-full flex-1">
      {!resizing.resizing && (
        <CartesianPlot
          kind={kind}
          data={data}
          x={x}
          series={series}
          linkedCursor
          className="h-full animate-in fade-in duration-200"
          selection={{ range: owner === chartId && start && end ? { start, end } : null, onChange }}
        />
      )}
      <div
        className={`pointer-events-none absolute inset-0 rounded-md bg-emphasis-1 transition-opacity duration-200 ${resizing.resizing ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
};

export default SelectableChart;
