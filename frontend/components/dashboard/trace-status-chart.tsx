import { memo, useMemo } from "react";
import useSWR from "swr";

import LineChart from "@/components/dashboard/line-chart";
import { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { AggregationFunction, TraceMetric, TraceStatusValue } from "@/lib/clickhouse/types";
import { cn, swrFetcher, toFixedIfFloat } from "@/lib/utils";

interface TraceStatusDatapoint {
  time: string;
  value: TraceStatusValue;
}

interface TraceStatusChartProps {
  className?: string;
  title?: string;
  projectId: string;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  defaultGroupByInterval?: string;
}

export const TraceStatusChart = memo<TraceStatusChartProps>(
  ({
    className,
    title = "Trace Status",
    projectId,
    pastHours,
    startDate,
    endDate,
    defaultGroupByInterval = "hour",
  }) => {
    const params = useMemo(() => {
      if (!pastHours && !startDate && !endDate) {
        return null;
      }

      const baseParams = {
        metric: TraceMetric.TraceStatus,
        groupByInterval: defaultGroupByInterval,
        aggregation: AggregationFunction.SUM,
        ...(pastHours ? { pastHours } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      };

      return new URLSearchParams(baseParams).toString();
    }, [defaultGroupByInterval, pastHours, startDate, endDate]);

    const { data, isLoading } = useSWR<TraceStatusDatapoint[]>(
      params ? `/api/projects/${projectId}/traces/metrics?${params}` : null,
      swrFetcher
    );

    const { chartData, totalSuccess, totalErrors } = useMemo(() => {
      if (!data) {
        return { chartData: [], totalSuccess: 0, totalErrors: 0 };
      }

      const chartData = data.map((d) => ({
        timestamp: d.time,
        success: d.value.success || 0,
        error: d.value.error || 0,
      }));

      const totalSuccess = data.reduce((sum, point) => sum + (point.value.success || 0), 0);
      const totalErrors = data.reduce((sum, point) => sum + (point.value.error || 0), 0);

      return { chartData, totalSuccess, totalErrors };
    }, [data]);

    const chartConfig = useMemo(
      () =>
        ({
          success: {
            color: "hsl(var(--chart-2))",
            label: "Success",
          },
          error: {
            color: "hsl(var(--chart-5))",
            label: "Error",
          },
        }) satisfies ChartConfig,
      []
    );

    return (
      <div
        className={cn(className, "flex flex-col space-y-2 border rounded-lg p-4 h-full border-dashed border-border")}
      >
        <div className="flex-none">
          <div className="flex justify-between items-center text-sm font-medium">
            <div className="flex-grow text-secondary-foreground">{title}</div>
          </div>
        </div>
        <div className="flex gap-2 text-2xl font-medium">
          <span className="text-[hsl(var(--chart-2))]">{toFixedIfFloat(totalSuccess)}</span>
          <span className="text-[hsl(var(--chart-5))]">{toFixedIfFloat(totalErrors)}</span>
        </div>
        <div className="flex-1">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <LineChart
              data={chartData}
              xAxisKey="timestamp"
              chartConfig={chartConfig}
              groupByInterval={defaultGroupByInterval as GroupByInterval}
              keys={new Set(["success", "error"])}
            />
          )}
        </div>
      </div>
    );
  }
);

TraceStatusChart.displayName = "TraceStatusChart";

export default TraceStatusChart;
