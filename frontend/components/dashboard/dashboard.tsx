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
import { EventTemplate } from "@/lib/events/types";
import DateRangeFilter from "../ui/date-range-filter";
import { Skeleton } from "../ui/skeleton";
import { useSearchParams } from "next/navigation";


interface CustomChartProps {
  eventTemplate: EventTemplate
  pastHours?: string
  startDate?: string
  endDate?: string
  className?: string
}

export function CustomChart({
  eventTemplate,
  className,
  pastHours,
  startDate,
  endDate
}: CustomChartProps) {

  const [xAxisKey, setXAxisKey] = useState<string>("time");
  const [yAxisKey, setYAxisKey] = useState<string>("value");
  const [data, setData] = useState<any[] | null>(null);

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

    const body: Record<string, any> = {
      metric: "eventCount",
      aggregation: "Total",
      groupByInterval
    };
    if (pastHours) {
      body["pastHours"] = pastHours;
    } else {
      body["startDate"] = startDate;
      body["endDate"] = endDate;
    }

    console.log(body)


    fetch(`/api/projects/${eventTemplate.projectId}/event-templates/${eventTemplate.id}/metrics`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body)
    })
      .then(res => res.json().then((data: any) => {
        setData(data);
      }))

  }, [eventTemplate, pastHours]);

  return (
    <Card className={cn(className, "")}>
      <CardHeader>
        <CardTitle>{eventTemplate.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          {(data === null) ? <Skeleton /> :
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
          }
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export interface DashboardProps {
  eventTemplates: EventTemplate[];
}

export default function Dashboard({ eventTemplates }: DashboardProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;
  return (
    <div className="flex-grow flex flex-col p-4 space-y-4">
      <DateRangeFilter />
      <div className="grid grid-cols-3 gap-4">
        {
          eventTemplates.map((eventTemplate) => (
            <div key={`event-${eventTemplate.id}`} className="flex-1">
              <CustomChart
                eventTemplate={eventTemplate}
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                className=""
              />
            </div>
          ))
        }
      </div>
    </div>
  );
}
