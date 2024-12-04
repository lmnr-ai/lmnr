'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { useProjectContext } from '@/contexts/project-context';
import { TraceMetricDatapoint } from '@/lib/traces/types';
import {
  formatTimestampFromSeconds,
  getGroupByInterval
} from '@/lib/utils';

import { Skeleton } from '../ui/skeleton';

interface CustomChartProps {
  metric: string;
  aggregation: string;
  title: string;
  xAxisKey: string;
  yAxisKey: string;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  defaultGroupByInterval?: string;
}

export function CustomChart({
  metric,
  aggregation,
  title,
  xAxisKey,
  yAxisKey,
  pastHours,
  startDate,
  endDate,
  defaultGroupByInterval
}: CustomChartProps) {
  const [data, setData] = useState<TraceMetricDatapoint[] | null>(null);
  const { projectId } = useProjectContext();

  const chartConfig = {
    [xAxisKey]: {
      color: 'hsl(var(--chart-2))'
    }
  } satisfies ChartConfig;
  const inferredGroupBy = getGroupByInterval(
    pastHours,
    startDate,
    endDate,
    defaultGroupByInterval
  );

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      return;
    }
    const body: Record<string, any> = {
      metric,
      aggregation,
      groupByInterval: inferredGroupBy
    };
    if (pastHours) {
      body['pastHours'] = pastHours;
    } else {
      body['startDate'] = startDate;
      body['endDate'] = endDate;
    }

    fetch(`/api/projects/${projectId}/traces/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
      .then((res) => res.json())
      .then((data: any) => {
        setData(data);
      });
  }, [defaultGroupByInterval, pastHours, startDate, endDate]);

  return (
    <div className="">
      <div className="flex space-x-2 justify-between text-sm font-medium text-secondary-foreground ">
        <div className="flex-grow">{title}</div>
      </div>
      <div className="">
        <ChartContainer config={chartConfig} className="max-h-40 w-full">
          {data === null ? (
            <Skeleton className="h-40" />
          ) : (
            <LineChart
              accessibilityLayer
              data={data}
              margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                type="category"
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                tickCount={data.length + 1}
                tickFormatter={formatTimestampFromSeconds}
                axisLine={false}
                dataKey={xAxisKey}
                padding="no-gap"
              />
              <YAxis tickLine={false} axisLine={false} tickCount={4} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelKey={xAxisKey}
                    labelFormatter={(label: string, p: any) =>
                      formatTimestampFromSeconds(p[0].payload[xAxisKey])
                    }
                  />
                }
              />
              <Line dataKey={yAxisKey} dot={false} fill="hsl(var(--chart-1))" />
            </LineChart>
          )}
        </ChartContainer>
      </div>
    </div>
  );
}

export interface TracesMetricsProps {
  pastHours?: string;
  startDate?: string;
  endDate?: string;
}

export default function TracesMetrics() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;
  const groupByInterval = searchParams.get('groupByInterval') as
    | string
    | undefined;

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
          defaultGroupByInterval={groupByInterval}
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
          defaultGroupByInterval={groupByInterval}
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
          defaultGroupByInterval={groupByInterval}
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
          defaultGroupByInterval={groupByInterval}
        />
      </div>
    </div>
  );
}
