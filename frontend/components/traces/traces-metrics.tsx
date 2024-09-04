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


interface CustomChartProps {
  metric: string
  aggregation: string
  title: string
  xAxisKey: string
  yAxisKey: string
  pastHours: string
}

export function CustomChart({ metric, aggregation, title, xAxisKey, yAxisKey, pastHours }: CustomChartProps) {
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
    } else {
      groupByInterval = "day";
    }

    fetch(`/api/projects/${projectId}/traces/metrics`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metric,
        aggregation,
        groupByInterval,
        pastHours,
      })
    })
      .then(res => res.json()).then((data: any) => {
        console.log(`Data for ${metric} metric: ${JSON.stringify(data)}`)
        setData(data)
      })
  }, [pastHours])

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
  pastHours: string
}

export default function TracesMetrics({ pastHours }: TracesMetricsProps) {
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
        />
      </div>
    </div>
  );
}