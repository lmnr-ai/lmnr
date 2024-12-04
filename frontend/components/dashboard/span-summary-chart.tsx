import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/spans";
import { AggregationFunction } from "@/lib/clickhouse/utils";
import { buildSpansUrl } from "@/lib/traces/utils";
import { cn, toFixedIfFloat } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

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

// Heavily inspired by
// https://github.com/tremorlabs/tremor/blob/main/src/components/vis-elements/BarList/BarList.tsx

// We should be able to set something like a LabelList on the right from v3
// https://github.com/recharts/recharts/issues/4579
// We can consider migrating this to recharts here, once v3 is out.

export default function SpanSummaryChart({
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
}: SpanSummaryChartProps) {
  const router = useRouter();
  const [data, setData] = useState<Record<string, any>[] | null>(null);


  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      return;
    }
    const params: Record<string, any> = {
      metric,
      groupBy,
      aggregation: 'SUM',
    };
    if (pastHours) {
      params['pastHours'] = pastHours;
    } else {
      params['startDate'] = startDate;
      params['endDate'] = endDate;
    }

    fetch(`/api/projects/${projectId}/spans/metrics/summary?${new URLSearchParams(params).toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setData(data
          .map((d: any) => ({ ...d, value: Number(d.value) }))
          .slice(0, 5)
        );
      });
  }, [pastHours, startDate, endDate, groupBy, projectId, metric, maxItems]);

  const widths = useMemo(() => {
    const maxValue = Math.max(...(data?.map((d) => d.value) ?? []), 0);
    if (maxValue === 0) {
      return data?.map(() => 0);
    }
    return data?.map((d) => d.value === 0 ? 0 : Math.max(2, d.value / maxValue * 100)) ?? [];
  }, [data]);

  const totalValue = useMemo(() => {
    if (!data) return 0;
    return data.reduce((sum, d) => sum + d.value, 0);
  }, [data]);

  return (
    <div className="flex flex-col border gap-1 rounded-lg p-4 h-full border-dashed border-border">
      <div className="flex justify-between items-center">
        <div className="font-medium text-sm text-secondary-foreground">{title}</div>
      </div>
      {data === null ? (
        <Skeleton className="h-full w-full" />
      ) : data.length === 0 ? (
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
              {data?.map((d, index) =>
                <div
                  key={index}
                  onClick={() => {
                    router.push(buildSpansUrl(projectId, groupBy, d[groupBy], pastHours, startDate, endDate));
                  }}
                  className="group w-full flex items-center rounded-sm cursor-pointer"
                >
                  <div
                    className={cn("flex items-center rounded transition-all bg-blue-500/80")}
                    style={{
                      width: `${widths?.[index] ?? 0}%`,
                      height: `${barHeight * 4}px`,
                    }}
                  >
                    <div className={"absolute left-2 pr-4 flex max-w-full"}>
                      <p className="whitespace-nowrap truncate text-foreground text-sm">{d[groupBy]}</p>
                    </div>
                  </div>
                </div>
              )}
              {data == null && Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="group w-full flex items-center rounded-sm">
                  <Skeleton className={cn("flex items-center rounded transition-all w-full", `h-[${barHeight * 4}px]`)} />
                </div>
              ))}
            </div>
            <div className="flex-col space-y-1.5">
              {data?.map((d, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center justify-end",
                    index === data.length - 1 ? "mb-0" : "mb-1"
                  )}
                  style={{
                    height: `${barHeight * 4}px`,
                  }}
                >
                  <TooltipProvider key={index} delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          key={index}
                          onClick={() => {
                            router.push(buildSpansUrl(projectId, groupBy, d[groupBy], pastHours, startDate, endDate));
                          }}
                          className="group w-full flex items-center rounded-sm space-x-1 cursor-pointer hover:underline"
                        >
                          <p className={cn(
                            "whitespace-nowrap truncate leading-none font-medium text-sm",
                            index === data.length - 1 ? "mr-0" : "mr-1"
                          )} >{toFixedIfFloat(d.value)}</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="p-0 border">
                        <div>
                          <p className="max-w-sm break-words whitespace-pre-wrap">
                            View spans
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



