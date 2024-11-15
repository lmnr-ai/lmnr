import { SpanMetric } from "@/lib/clickhouse/spans";

import { SpanMetricGroupBy } from "@/lib/clickhouse/spans";
import { AggregationFunction } from "@/lib/clickhouse/utils";
import { cn } from "@/lib/utils";
import { useEffect, useMemo } from "react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { useRouter } from "next/navigation";
import { buildSpansUrl } from "@/lib/traces/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TooltipProvider } from "../ui/tooltip";
import { Search } from "lucide-react";

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
}

const DEFAULT_MAX_ITEMS = 10;

const toFixedIfNeeded = (value: number) => value % 1 === 0 ? value : parseFloat(`${value}`)?.toFixed(5);

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
  maxItems = DEFAULT_MAX_ITEMS,
  barHeight = 8,
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
          .map((d: any) => ({...d, value: Number(d.value)}))
          .slice(0, maxItems)
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

  return (
    <div className="flex flex-col space-y-2 p-8">
      <div className="flex justify-start items-center">
        <div className="font-medium text-lg">{title}</div>
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
                className = {cn("flex items-center rounded transition-all", `h-[${barHeight*4}px]`)}
                style={{ width: `${widths?.[index] ?? 0}%`, backgroundColor: `hsl(var(--chart-1))` }}
              >
                <div className={"absolute left-2 pr-4 flex max-w-full"}>
                  <p className="whitespace-nowrap truncate text-foreground">{d[groupBy]}</p>
                </div>
              </div>
            </div>
          )}
          {data == null && Array.from({length: 3}).map((_, index) => (
            <div key={index} className="group w-full flex items-center rounded-sm">
              <Skeleton className={cn("flex items-center rounded transition-all w-full", `h-[${barHeight*4}px]`)} />
            </div>
          ))}
        </div>
        <div className="flex-col space-y-1.5">
          {data?.map((d, index) => (
            <div
              key={index}
              className={cn(
                "flex items-center justify-end",
                `h-[${barHeight*4}px]`,
                index === data.length - 1 ? "mb-0" : "mb-1"
              )}
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
                        "whitespace-nowrap truncate leading-none text-muted-foreground",
                        index === data.length - 1 ? "mr-0" : "mr-1"
                      )} >{toFixedIfNeeded(d.value)}</p>
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
          {data == null && Array.from({length: 3}).map((_, index) => (
            <Skeleton
              key={index}
              className={cn(
                "flex items-center justify-end w-8",
                `h-[${barHeight*4}px]`,
                index === 2 ? "mb-0" : "mb-1"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}



