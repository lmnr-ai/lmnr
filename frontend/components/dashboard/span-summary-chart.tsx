import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { memo, useMemo } from "react";
import useSWR from "swr";

import { AggregationFunction, SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/types";
import { buildSpansUrl } from "@/lib/traces/utils";
import { cn, swrFetcher, toFixedIfFloat } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface SpanMetricSummary {
  value: number;
  model?: string;
  provider?: string;
  path?: string;
  name?: string;
}

interface SpanSummaryChartProps {
  title: string;
  projectId: string;
  metric: SpanMetric;
  groupBy: SpanMetricGroupBy;
  pastHours: string;
  startDate: string;
  endDate: string;
  barHeight?: number;
  className?: string;
  aggregations?: AggregationFunction[];
  defaultAggregation?: AggregationFunction;
  maxItems?: number;
  addDollarSign?: boolean;
}

const SpanSummaryChart = memo<SpanSummaryChartProps>(
  ({
    title,
    projectId,
    metric,
    groupBy,
    pastHours,
    startDate,
    endDate,
    maxItems = 5,
    barHeight = 8,
    addDollarSign = false,
  }) => {
    const router = useRouter();

    const params = useMemo(() => {
      const queryParams: Record<string, any> = {
        metric,
        groupBy,
        aggregation: "SUM",
      };
      if (pastHours) {
        queryParams["pastHours"] = pastHours;
      } else {
        queryParams["startDate"] = startDate;
        queryParams["endDate"] = endDate;
      }
      return queryParams;
    }, [metric, groupBy, pastHours, startDate, endDate]);

    const queryString = useMemo(() => new URLSearchParams(params).toString(), [params]);

    const { data, isLoading } = useSWR<SpanMetricSummary[]>(
      !pastHours && !startDate && !endDate ? null : `/api/projects/${projectId}/spans/metrics/summary?${queryString}`,
      swrFetcher
    );

    const processedData = useMemo(() => {
      if (!data) return null;
      return data.map((d) => ({ ...d, value: Number(d.value) })).slice(0, maxItems);
    }, [data, maxItems]);

    const widths = useMemo(() => {
      if (!processedData) return [];
      const maxValue = Math.max(...processedData.map((d) => d.value), 0);
      if (maxValue === 0) {
        return processedData.map(() => 0);
      }
      return processedData.map((d) => (d.value === 0 ? 0 : Math.max(2, (d.value / maxValue) * 100)));
    }, [processedData]);

    const totalValue = useMemo(() => {
      if (!processedData) return 0;
      return processedData.reduce((sum, d) => sum + d.value, 0);
    }, [processedData]);

    const getGroupByValue = (item: SpanMetricSummary): string => {
      switch (groupBy) {
        case SpanMetricGroupBy.Model:
          return item.model || "";
        case SpanMetricGroupBy.Provider:
          return item.provider || "";
        case SpanMetricGroupBy.Path:
          return item.path || "";
        case SpanMetricGroupBy.Name:
          return item.name || "";
        default:
          return "";
      }
    };

    return (
      <div className="flex flex-col border gap-1 rounded-lg p-4 h-full border-dashed border-border">
        <div className="flex justify-between items-center">
          <div className="font-medium text-sm text-secondary-foreground">{title}</div>
        </div>
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : !processedData || processedData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center p-8 bg-muted/30 rounded-lg">
            <div className="flex flex-col items-center justify-center h-full w-full">
              <div className="text-muted-foreground text-xs">No data during this time period</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="text-2xl font-medium mb-2">
              {addDollarSign ? `$${toFixedIfFloat(totalValue)}` : toFixedIfFloat(totalValue)}
            </div>
            <div className="flex justify-between space-x-6">
              <div className="relative w-full space-y-1.5">
                {processedData.map((d, index) => {
                  const groupByValue = getGroupByValue(d);
                  return (
                    <Link
                      key={index}
                      href={buildSpansUrl(projectId, groupBy, groupByValue, pastHours, startDate, endDate)}
                      className="group w-full flex items-center rounded-sm cursor-pointer"
                    >
                      <div
                        className={cn("flex items-center rounded transition-all bg-blue-500/80")}
                        style={{
                          width: `${widths[index] ?? 0}%`,
                          height: `${barHeight * 4}px`,
                        }}
                      >
                        <div className={"absolute left-2 pr-4 flex max-w-full"}>
                          <p className="whitespace-nowrap truncate text-foreground text-sm">{groupByValue}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="flex-col space-y-1.5">
                {processedData.map((d, index) => {
                  const groupByValue = getGroupByValue(d);
                  return (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center justify-end",
                        index === processedData.length - 1 ? "mb-0" : "mb-1"
                      )}
                      style={{
                        height: `${barHeight * 4}px`,
                      }}
                    >
                      <TooltipProvider delayDuration={250}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              onClick={() => {
                                router.push(
                                  buildSpansUrl(projectId, groupBy, groupByValue, pastHours, startDate, endDate)
                                );
                              }}
                              className="group w-full flex items-center rounded-sm space-x-1 cursor-pointer hover:underline"
                            >
                              <p
                                className={cn(
                                  "whitespace-nowrap truncate leading-none font-medium text-sm",
                                  index === processedData.length - 1 ? "mr-0" : "mr-1"
                                )}
                              >
                                {toFixedIfFloat(d.value)}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="p-0 border">
                            <div>
                              <p className="max-w-sm break-words whitespace-pre-wrap">View spans</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

SpanSummaryChart.displayName = "SpanSummaryChart";

export default SpanSummaryChart;
