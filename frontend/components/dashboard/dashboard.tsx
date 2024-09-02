'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { cn, formatTimestampFromSeconds } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useProjectContext } from "@/contexts/project-context";
import { TraceMetricDatapoint } from "@/lib/traces/types";
import RangeSelect from "./range-select";

const TRACE_METRICS = [{
  'metric': 'traceCount',
  'groupBy': 'Total',
}, {
  'metric': 'traceLatencySeconds',
  'groupBy': 'Average',
}, {
  'metric': 'totalTokenCount',
  'groupBy': 'Average',
}, {
  'metric': 'costUsd',
  'groupBy': 'Average',
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
    <Card className={cn(className, "")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              type="number"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              tickFormatter={formatTimestampFromSeconds}
              axisLine={false}
              tickMargin={8}
              dataKey={xAxisKey}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickCount={3}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent
                labelKey={xAxisKey}
                labelFormatter={(label, p) => formatTimestampFromSeconds(p[0].payload[xAxisKey])}
              />}
            />
            <Area
              dataKey={yAxisKey}
              type="monotone"
              fillOpacity={0.4}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export interface DashboardProps {
}

export default function Dashboard({ }: DashboardProps) {
  const { projectId } = useProjectContext();

  const [pastHours, setPastHours] = useState<number | null>(null);
  const [groupByInterval, setGroupByInterval] = useState<string | null>(null);

  const [tokenCounts, setTokenCounts] = useState<TraceMetricDatapoint[]>([]);
  const [latencies, setLatencies] = useState<TraceMetricDatapoint[]>([]);
  const [runCounts, setRunCounts] = useState<TraceMetricDatapoint[]>([]);
  const [approximateCosts, setApproximateCosts] = useState<TraceMetricDatapoint[]>([]);
  const [eventMetrics, setEventMetrics] = useState<any[]>([]);

  useEffect(() => {
    if (pastHours === null || groupByInterval === null) {
      return;
    }

    fetch(`/api/projects/${projectId}/traces/metrics`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metrics: TRACE_METRICS,
        groupByInterval,
        pastHours: pastHours.toString(),
      })
    })
      .then(res => res.json()).then((data: any) => {
        setTokenCounts(data.totalTokenCountAverage)
        setLatencies(data.traceLatencySecondsAverage)
        setRunCounts(data.traceCountTotal)
        setApproximateCosts(data.costUsdAverage)
      })

    fetch(`/api/projects/${projectId}/events/metrics?groupByInterval=${groupByInterval}&pastHours=${pastHours}`)
      .then(res => res.json().then((data: any) => {
        setEventMetrics(data);
      }))
  }, [groupByInterval, pastHours]);

  return (
    <div className="flex-grow flex flex-col p-4 space-y-4">
      <RangeSelect setPastHours={setPastHours} setGroupByInterval={setGroupByInterval} />
      <div className="grid grid-cols-3 gap-4">
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
            title="Average token count"
            xAxisKey="time"
            yAxisKey="value"
            className=""
            data={tokenCounts}
          />
        </div>
        <div className="flex-1">
          <CustomChart
            title="Average cost"
            xAxisKey="time"
            yAxisKey="value"
            className=""
            data={approximateCosts}
          />
        </div>
        {
          Object.entries(eventMetrics).map(([key, value]) => (
            <div key={`event-${key}`} className="flex-1">
              <CustomChart
                title={key}
                xAxisKey="time"
                yAxisKey="value"
                className=""
                data={value.count}
              />
            </div>
          ))
        }
      </div>
    </div>
  );
}
