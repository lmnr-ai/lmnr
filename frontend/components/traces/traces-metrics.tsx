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
import { TraceMetricAnalytics } from "@/lib/traces/types";

const TRACE_METRICS = [{
  'metric': 'traceCount',
  'groupBy': 'Total',
}, {
  'metric': 'traceLatencySeconds',
  'groupBy': 'Average',
}, {
  'metric': 'totalTokenCount',
  'groupBy': 'Total',
}, {
  'metric': 'costUsd',
  'groupBy': 'Total',
}]


interface CustomChartProps {
  data: any
  title: string
  xAxisKey: string
  yAxisKey: string
  className?: string
}

export function CustomChart({ data, title, xAxisKey, yAxisKey, className }: CustomChartProps) {

  const chartConfig = {
    [xAxisKey]: {
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig

  return (
    <div className="">
      <div className="text-sm font-medium text-secondary-foreground">
        {title}
      </div>
      <div className="">
        <ChartContainer config={chartConfig} className="max-h-40 w-full">
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
        </ChartContainer>
      </div>
    </div>
  )
}

export interface TracesMetricsProps {
  pastHours: string
}

export default function TracesMetrics({ pastHours }: TracesMetricsProps) {
  const { projectId } = useProjectContext();

  const [tokenCounts, setTokenCounts] = useState<TraceMetricAnalytics[]>([]);
  const [latencies, setLatencies] = useState<TraceMetricAnalytics[]>([]);
  const [runCounts, setRunCounts] = useState<TraceMetricAnalytics[]>([]);
  const [approximateCosts, setApproximateCosts] = useState<TraceMetricAnalytics[]>([]);

  useEffect(() => {

    if (pastHours === null) {
      return;
    }

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

    console.log("groupByInterval", groupByInterval)

    fetch(`/api/projects/${projectId}/traces/metrics`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metrics: TRACE_METRICS,
        groupByInterval,
        pastHours,
      })
    })
      .then(res => res.json()).then((data: any) => {
        setTokenCounts(data.totalTokenCountTotal)
        setLatencies(data.traceLatencySecondsAverage)
        setRunCounts(data.traceCountTotal)
        setApproximateCosts(data.costUsdTotal)
      })
  }, [pastHours]);

  return (
    <div className="flex p-4 space-x-4 border-b">
      <div className="flex-1">
        <CustomChart
          title="Trace count"
          xAxisKey="time"
          yAxisKey="value"
          className=""
          data={runCounts}
        />
      </div>
      <div className="flex-1">
        <CustomChart
          title="Average run time"
          xAxisKey="time"
          yAxisKey="value"
          className=""
          data={latencies}
        />
      </div>
      <div className="flex-1">
        <CustomChart
          title="Total token count"
          xAxisKey="time"
          yAxisKey="value"
          className=""
          data={tokenCounts}
        />
      </div>
      <div className="flex-1">
        <CustomChart
          title="Total cost"
          xAxisKey="time"
          yAxisKey="value"
          className=""
          data={approximateCosts}
        />
      </div>
    </div>
  );
}