import { useMemo } from "react";
import useSWR from "swr";

import { ChartConfig } from "@/components/ui/chart";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { cn, swrFetcher, toFixedIfFloat } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";
import { DefaultLineChart } from "./span-stat-chart";

interface LabelMetricDatapoint {
  time: string;
  value: number;
}

interface LabelStatChartProps {
  className?: string;
  title: string;
  projectId: string;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  defaultGroupByInterval?: string;
  showTotal?: boolean;
}

export function LabelStatChart({
  className,
  title,
  pastHours,
  startDate,
  endDate,
  defaultGroupByInterval = "hour",
  showTotal = true,
  projectId,
}: LabelStatChartProps) {
  const chartConfig = {
    value: {
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  const params: Record<string, any> = {
    groupByInterval: defaultGroupByInterval,
    ...(pastHours ? { pastHours } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const queryString = new URLSearchParams(params).toString();

  const { data, isLoading } = useSWR<LabelMetricDatapoint[]>(
    pastHours || (startDate && endDate) ? `/api/projects/${projectId}/spans/metrics/labels?${queryString}` : null,
    swrFetcher
  );

  const totalCount = useMemo(() => data?.reduce((sum, point) => sum + point.value, 0) ?? 0, [data]);

  return (
    <div className={cn(className, "flex flex-col space-y-2 border rounded-lg p-4 h-full border-dashed border-border")}>
      <div className="flex-none">
        <div className="flex-col space-y-2 justify-between text-sm font-medium">
          <div className="flex justify-between items-center">
            <div className="flex-grow text-secondary-foreground">{title}</div>
          </div>
        </div>
      </div>
      {showTotal && <div className="text-2xl font-medium">{toFixedIfFloat(totalCount)}</div>}
      <div className="flex-1">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <DefaultLineChart
            data={
              data?.map((d) => ({
                value: d.value,
                timestamp: d.time,
              })) ?? []
            }
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
