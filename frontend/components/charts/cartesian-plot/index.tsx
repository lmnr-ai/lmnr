"use client";

import { type ChartPoint, type ChartScene } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react/tooltip";
import { useCallback, useMemo, useRef, useState } from "react";

import "./styles.css";

import { cn } from "@/lib/utils";

import { buildDefinition, type SeriesRow } from "./definition";
import FocusDots from "./focus-dots";
import PlotMarkers from "./markers";
import { snapMarkersToBuckets } from "./markers-utils";
import { samePlotGeometry } from "./scene-geometry";
import DefaultTooltip from "./tooltip";
import { type ControlledSelection, type PlotMarker, type PlotSeries, type PlotTooltip } from "./types";
import { useRangeSelection } from "./use-range-selection";
import { useXAxisLabels } from "./use-x-axis-labels";

export type { PlotMarker, PlotSeries, PlotTooltipProps } from "./types";

type Scene = ChartScene<SeriesRow, string, number>;
type Points = readonly ChartPoint<SeriesRow, string, number>[];

const pointerOverStack = (scene: Scene | null, total: number | null, y: number | null) => {
  if (!scene || total === null || y === null) return true;
  const top = scene.scales.y?.map(total);
  return top === undefined || (y >= top && y <= scene.chart.y + scene.chart.height);
};

interface CartesianPlotProps<T extends object> {
  kind: "line" | "bar";
  data: T[];
  x: string;
  series: PlotSeries[];
  tooltip?: PlotTooltip;
  markers?: PlotMarker[];
  /** A completed drag in x-domain values. The caller decides whether it is a valid range. */
  onRangeSelect?: (start: string, end: string) => void;
  /** Controlled selection for dashboards, where a completed range remains highlighted. */
  selection?: ControlledSelection;
  /** Synchronize hover across the dashboard charts. */
  linkedCursor?: boolean;
  stackOrder?: readonly string[];
  ariaLabel?: string;
  className?: string;
}

export default function CartesianPlot<T extends object>({
  kind,
  data,
  x,
  series,
  tooltip: Tooltip = DefaultTooltip,
  markers,
  onRangeSelect,
  selection,
  linkedCursor,
  stackOrder,
  ariaLabel = "chart",
  className,
}: CartesianPlotProps<T>) {
  const xLabels = useXAxisLabels(data as Record<string, unknown>[], x);
  const rows = useMemo(
    () =>
      data.flatMap((record) => {
        const row = record as Record<string, unknown>;
        return series.map((item): SeriesRow => ({
          x: String(row[x]),
          series: item.key,
          value: Number(row[item.key]) || 0,
        }));
      }),
    [data, x, series]
  );
  const definition = useMemo(
    () => buildDefinition({ kind, rows, series, xLabels, stackOrder, markers: !!markers?.length, linkedCursor }),
    [kind, rows, series, xLabels, stackOrder, markers?.length, linkedCursor]
  );
  const [scene, setScene] = useState<Scene | null>(null);
  const [focused, setFocused] = useState<Points>([]);
  const [overBar, setOverBar] = useState(true);
  const hovered = useRef(false);
  const pointerY = useRef<number | null>(null);
  const focusedTotal = useRef<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRangeSelection(scene, onRangeSelect, selection);
  const onBarFocusGroupChange = useCallback(
    (points: Points) => {
      focusedTotal.current = points.length ? points.reduce((sum, point) => sum + point.datum.value, 0) : null;
      setOverBar(pointerOverStack(scene, focusedTotal.current, pointerY.current));
    },
    [scene]
  );
  const snappedMarkers = useMemo(
    () =>
      snapMarkersToBuckets(
        markers,
        data.map((row) => ({ timestamp: String((row as Record<string, unknown>)[x]) }))
      ),
    [markers, data, x]
  );
  const onRender = useCallback(({ scene: next }: { scene: Scene }) => {
    setScene((previous) => (previous && samePlotGeometry(previous, next) ? previous : next));
  }, []);

  return (
    <div
      ref={container}
      className={cn("relative min-h-0 w-full text-xs [&_*:focus]:outline-none", className)}
      onPointerEnter={() => (hovered.current = true)}
      onPointerLeave={() => {
        hovered.current = false;
        pointerY.current = null;
        focusedTotal.current = null;
        setOverBar(true);
      }}
      onPointerMove={(event) => {
        pointerY.current = event.clientY - (container.current?.getBoundingClientRect().top ?? 0);
        if (kind === "bar") setOverBar(pointerOverStack(scene, focusedTotal.current, pointerY.current));
      }}
      onPointerDown={onRangeSelect || selection ? drag.onPointerDown : undefined}
      style={onRangeSelect || selection ? { userSelect: "none", cursor: "crosshair" } : undefined}
    >
      <Chart
        definition={definition}
        ariaLabel={ariaLabel}
        style={{ height: "100%" }}
        onFocusChange={onRangeSelect || selection ? drag.onFocusChange : undefined}
        onFocusGroupChange={kind === "line" ? setFocused : onBarFocusGroupChange}
        onRender={onRender}
        renderTooltipBody={({ points }) => {
          if (!hovered.current || !points.length) return null;
          const xValue = points[0].datum.x;
          const values = new Map(points.map((point) => [point.datum.series, point.datum.value]));
          return (
            <Tooltip
              x={xValue}
              label={xLabels.formatTooltip(xValue)}
              items={series.map((item) => ({ ...item, value: values.get(item.key) ?? 0 }))}
              overBar={kind !== "bar" || overBar}
            />
          );
        }}
      />
      {kind === "line" && <FocusDots points={focused} />}
      <PlotMarkers markers={snappedMarkers} scene={scene} />
      {drag.overlay && (
        <div className="pointer-events-none absolute border border-primary/50 bg-primary/30" style={drag.overlay} />
      )}
    </div>
  );
}
