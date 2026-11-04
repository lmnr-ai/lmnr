"use client";

import { type RefObject, useMemo } from "react";
import { shallow } from "zustand/shallow";

import "./styles.css";

import CartesianPlot, { type PlotSeries } from "@/components/charts/cartesian-plot";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { useChartUrlZoom } from "@/components/charts/use-chart-url-zoom";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { cn } from "@/lib/utils";

interface TracesChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const series: PlotSeries[] = [
  { key: "successCount", label: "Success", color: "var(--success)" },
  { key: "errorCount", label: "Error", color: "var(--destructive)" },
];
const countNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

export default function TracesChart({ className, containerRef }: TracesChartProps) {
  const { stats, isLoadingStats } = useTracesStoreContext(
    (state) => ({ stats: state.stats, isLoadingStats: state.isLoadingStats }),
    shallow
  );
  const data = useMemo(() => stats ?? [], [stats]);
  const onRangeSelect = useChartUrlZoom();
  const total = useMemo(() => data.reduce((sum, point) => sum + point.successCount + point.errorCount, 0), [data]);

  return (
    <div ref={containerRef} className={cn("traces-tanstack-chart flex flex-col", className)}>
      {!stats && isLoadingStats ? (
        <ChartSkeleton />
      ) : (
        <>
          <CartesianPlot
            kind="bar"
            data={data}
            x="timestamp"
            series={series}
            stackOrder={["successCount", "errorCount"]}
            ariaLabel="Trace counts by time: success and error"
            className="h-48"
            onRangeSelect={onRangeSelect}
          />
          <div className="mt-0.5 self-start text-xs text-muted-foreground" title={String(total)}>
            Total: {countNumberFormatter.format(total)}
          </div>
        </>
      )}
    </div>
  );
}
