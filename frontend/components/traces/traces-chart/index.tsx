"use client";

import { Chart } from "@tanstack/charts/react/tooltip";
import { type RefObject, useMemo } from "react";
import { shallow } from "zustand/shallow";

import "@/components/chart-builder/charts/cartesian-chart/styles.css";
import "./styles.css";

import TooltipBody from "@/components/chart-builder/charts/cartesian-chart/tooltip-body";
import { useXAxisLabels } from "@/components/chart-builder/charts/cartesian-chart/use-x-axis-labels";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { getTickCountForWidth } from "@/lib/charts/responsive";
import { cn } from "@/lib/utils";

import { buildTracesDefinition } from "./definition";
import { useTracesZoom } from "./use-traces-zoom";

interface TracesChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const countNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

export default function TracesChart({ className, containerRef }: TracesChartProps) {
  const { stats, isLoadingStats, chartContainerWidth } = useTracesStoreContext(
    (state) => ({
      stats: state.stats,
      isLoadingStats: state.isLoadingStats,
      chartContainerWidth: state.chartContainerWidth,
    }),
    shallow
  );
  const data = useMemo(() => stats ?? [], [stats]);
  const labels = useXAxisLabels(data, "timestamp");
  const tickCount = chartContainerWidth ? getTickCountForWidth(chartContainerWidth) : 8;
  const definition = useMemo(() => buildTracesDefinition(data, labels, tickCount), [data, labels, tickCount]);
  const zoom = useTracesZoom();
  const total = useMemo(() => data.reduce((sum, point) => sum + point.successCount + point.errorCount, 0), [data]);

  return (
    <div ref={containerRef} className={cn("traces-tanstack-chart flex flex-col", className)}>
      {!stats && isLoadingStats ? (
        <ChartSkeleton />
      ) : (
        <>
          <div
            className="relative h-48 w-full text-xs [&_*:focus]:outline-none"
            onPointerDown={zoom.onPointerDown}
            style={{ userSelect: "none", cursor: "crosshair" }}
          >
            <Chart
              definition={definition}
              ariaLabel="Trace counts by time: success and error"
              style={{ height: "100%" }}
              onFocusChange={zoom.onFocusChange}
              onRender={zoom.onRender}
              renderTooltipBody={({ points }) => <TooltipBody points={points} formatX={labels.formatTooltip} />}
            />
            {zoom.overlay && (
              <div
                className="pointer-events-none absolute border border-primary/50 bg-primary/30"
                style={zoom.overlay}
              />
            )}
          </div>
          <div className="mt-0.5 self-start text-xs text-muted-foreground" title={String(total)}>
            Total: {countNumberFormatter.format(total)}
          </div>
        </>
      )}
    </div>
  );
}
