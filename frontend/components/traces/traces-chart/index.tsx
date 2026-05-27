"use client";

import { type RefObject, useMemo } from "react";

import TimeSeriesChart from "@/components/charts/time-series-chart";
import { ChartSkeleton } from "@/components/charts/time-series-chart/skeleton";
import { type TimeSeriesChartConfig } from "@/components/charts/time-series-chart/types";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type TraceStatsMetric } from "@/lib/actions/traces/stats";

interface TracesChartProps {
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
}

const COUNT_CONFIG = {
  successCount: {
    label: "success",
    color: "hsl(var(--success-bright))",
    stackId: "stack",
  },
  errorCount: {
    label: "error",
    color: "hsl(var(--destructive-bright))",
    stackId: "stack",
  },
} as const satisfies TimeSeriesChartConfig;

const COUNT_FIELDS = ["successCount", "errorCount"] as const;

const VALUE_FIELDS = ["value"] as const;

const METRIC_LABELS: Record<TraceStatsMetric, string> = {
  count: "Count",
  total_tokens: "Total tokens",
  input_tokens: "Input tokens",
  output_tokens: "Output tokens",
  total_cost: "Total cost",
  input_cost: "Input cost",
  output_cost: "Output cost",
  duration: "Avg duration",
};

const METRIC_OPTIONS: TraceStatsMetric[] = [
  "count",
  "total_tokens",
  "input_tokens",
  "output_tokens",
  "total_cost",
  "input_cost",
  "output_cost",
  "duration",
];

const COST_METRICS = new Set<TraceStatsMetric>(["total_cost", "input_cost", "output_cost"]);

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 3 });
const costFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });

const buildFormatter = (metric: TraceStatsMetric) => {
  if (COST_METRICS.has(metric)) return (v: number) => costFormat.format(v);
  if (metric === "duration") return (v: number) => `${compactNumber.format(v)}s`;
  return (v: number) => compactNumber.format(v);
};

export default function TracesChart({ className, containerRef }: TracesChartProps) {
  const stats = useTracesStoreContext((s) => s.stats);
  const isLoadingStats = useTracesStoreContext((s) => s.isLoadingStats);
  const chartContainerWidth = useTracesStoreContext((s) => s.chartContainerWidth);
  const metric = useTracesStoreContext((s) => s.metric);
  const setMetric = useTracesStoreContext((s) => s.setMetric);

  const valueConfig = useMemo<TimeSeriesChartConfig>(
    () => ({
      value: {
        label: METRIC_LABELS[metric],
        color: "hsl(var(--chart-1))",
      },
    }),
    [metric]
  );

  const isCount = metric === "count";
  const formatValue = useMemo(() => buildFormatter(metric), [metric]);

  return (
    <div ref={containerRef} className={className}>
      <div className="flex items-center justify-end mb-1">
        <Select value={metric} onValueChange={(v) => setMetric(v as TraceStatsMetric)}>
          <SelectTrigger className="w-44 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_OPTIONS.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {METRIC_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!stats && isLoadingStats ? (
        <ChartSkeleton />
      ) : (
        <TimeSeriesChart
          data={stats ?? []}
          chartConfig={isCount ? COUNT_CONFIG : valueConfig}
          fields={isCount ? COUNT_FIELDS : VALUE_FIELDS}
          containerWidth={chartContainerWidth}
          formatValue={formatValue}
        />
      )}
    </div>
  );
}
