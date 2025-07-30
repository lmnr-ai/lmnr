import React, { memo, useMemo } from "react";
import useSWR from "swr";

import LineChart from "@/components/dashboard/line-chart";
import { ChartConfig } from "@/components/ui/chart";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { AggregationFunction } from "@/lib/clickhouse/types";
import { TraceMetricDatapoint } from "@/lib/traces/types";
import { cn, swrFetcher, toFixedIfFloat } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";

interface TraceStatChartProps {
  className?: string;
  metric: string;
  aggregation: AggregationFunction;
  title: string;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  defaultGroupByInterval?: string;
  projectId: string;
  addDollarSign?: boolean;
  showTotal?: boolean;
}

const TraceStatChart = memo<TraceStatChartProps>(
  ({
    className,
    metric,
    aggregation,
    title,
    pastHours,
    startDate,
    endDate,
    defaultGroupByInterval = "hour",
    addDollarSign = false,
    showTotal = false,
    projectId,
  }) => {
    const params = useMemo(() => {
      if (!pastHours && !startDate && !endDate) {
        return null;
      }

      const queryParams: Record<string, any> = {
        metric,
        aggregation,
        groupByInterval: defaultGroupByInterval,
      };

      if (pastHours) {
        queryParams["pastHours"] = pastHours;
      } else {
        queryParams["startTime"] = startDate;
        queryParams["endDate"] = endDate;
      }

      return queryParams;
    }, [metric, aggregation, defaultGroupByInterval, pastHours, startDate, endDate]);

    const queryString = useMemo(() => (params ? new URLSearchParams(params).toString() : null), [params]);

    const { data, isLoading } = useSWR<TraceMetricDatapoint[]>(
      queryString ? `/api/projects/${projectId}/traces/metrics?${queryString}` : null,
      swrFetcher
    );

    const { chartData, totalCount } = useMemo(() => {
      if (!data) {
        return { chartData: [], totalCount: 0 };
      }

      const chartData = data.map((d) => ({
        timestamp: d.time,
        value: Number(d.value),
      }));

      const totalCount = chartData.reduce((sum, point) => sum + point.value, 0);

      return { chartData, totalCount };
    }, [data]);

    const chartConfig = useMemo(
      () =>
        ({
          value: {
            color: "hsl(var(--chart-1))",
          },
        }) satisfies ChartConfig,
      []
    );

    return (
      <div
        className={cn(className, "flex flex-col space-y-2 border rounded-lg p-4 h-full border-dashed border-border")}
      >
        <div className="flex-none">
          <div className="flex-col space-y-2 justify-between text-sm font-medium">
            <div className="flex justify-between items-center">
              <div className="flex-grow text-secondary-foreground">{title}</div>
            </div>
          </div>
        </div>
        {showTotal && (
          <div className="text-2xl font-medium">
            {addDollarSign ? `$${toFixedIfFloat(totalCount)}` : toFixedIfFloat(totalCount)}
          </div>
        )}
        <div className="flex-1">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <LineChart
              data={chartData}
              xAxisKey="timestamp"
              chartConfig={chartConfig}
              groupByInterval={defaultGroupByInterval as GroupByInterval}
              keys={new Set(["value"])}
            />
          )}
        </div>
      </div>
    );
  }
);

TraceStatChart.displayName = "TraceStatChart";

export default TraceStatChart;
