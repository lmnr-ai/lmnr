'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatTimestampFromSeconds } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useProjectContext } from "@/contexts/project-context";
import { TraceMetricDatapoint } from "@/lib/traces/types";
import { Skeleton } from "../ui/skeleton";
import { useSearchParams } from "next/navigation";


interface CustomChartProps {
  metric: string
  aggregation: string
  title: string
  xAxisKey: string
  yAxisKey: string
  pastHours?: string
  startDate?: string
  endDate?: string
}

export function CustomChart({
  metric,
  aggregation,
  title,
  xAxisKey,
  yAxisKey,
  pastHours,
  startDate,
  endDate
}: CustomChartProps) {
  const [data, setData] = useState<TraceMetricDatapoint[] | null>(null);
  const { projectId } = useProjectContext();

  const chartConfig = {
    [xAxisKey]: {
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig

  useEffect(() => {
    let groupByInterval = "hour";

    if (pastHours === "1") {
      groupByInterval = "minute";
    } else if (pastHours === "7") {
      groupByInterval = "minute";
    } else if (pastHours === "24") {
      groupByInterval = "hour";
    } else if (parseInt(pastHours ?? '0') > 24) {
      groupByInterval = "day";
    }

    console.log({ pastHours, startDate, endDate, groupByInterval })

    const body: Record<string, any> = {
      metric,
      aggregation,
      groupByInterval
    };
    if (pastHours) {
      body["pastHours"] = pastHours;
    } else {
      body["startDate"] = startDate;
      body["endDate"] = endDate;
    }

    fetch(`/api/projects/${projectId}/traces/metrics`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body)
    })
      .then(res => res.json()).then((data: any) => {
        setData(data)
      })
  }, [pastHours, startDate, endDate])

  return (
    <div className="">
      <div className="text-sm font-medium text-secondary-foreground">
        {title}
      </div>
      <div className="">
        <ChartContainer config={chartConfig} className="max-h-40 w-full">

          {
            (data === null) ? <Skeleton className="h-40" /> :
              <BarChart
                accessibilityLayer
                data={data}
                margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickLine={false}
                  tickFormatter={formatTimestampFromSeconds}
                  axisLine={false}
                  dataKey={xAxisKey}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickCount={4}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent
                    labelKey={xAxisKey}
                    labelFormatter={(label, p) => formatTimestampFromSeconds(p[0].payload[xAxisKey])}
                  />}
                />
                <Bar
                  dataKey={yAxisKey}
                  type="monotone"
                  fill="hsl(var(--chart-1))"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
          }
        </ChartContainer>
      </div>
    </div>
  )
}

export interface TracesMetricsProps {
  pastHours?: string
  startDate?: string
  endDate?: string
}

export default function TracesMetrics() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;

  return (
    <div className="flex p-4 space-x-4 border-b">
      <div className="flex-1">
        <CustomChart
          metric="traceCount"
          aggregation="Total"
          title="Trace count"
          xAxisKey="time"
          yAxisKey="value"
          pastHours={pastHours}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
      <div className="flex-1">
        <CustomChart
          metric="traceLatencySeconds"
          aggregation="Average"
          title="Average run time"
          xAxisKey="time"
          yAxisKey="value"
          pastHours={pastHours}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
      <div className="flex-1">
        <CustomChart
          metric="totalTokenCount"
          aggregation="Total"
          title="Total token count"
          xAxisKey="time"
          yAxisKey="value"
          pastHours={pastHours}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
      <div className="flex-1">
        <CustomChart
          metric="costUsd"
          aggregation="Total"
          title="Total cost"
          xAxisKey="time"
          yAxisKey="value"
          pastHours={pastHours}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
    </div>
  );
}