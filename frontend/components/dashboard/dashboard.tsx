'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import {
  cn,
  formatTimestampFromSeconds,
  formatTimestampFromSecondsWithInterval,
  getGroupByInterval
} from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import DateRangeFilter from '../ui/date-range-filter';
import { GroupByPeriodSelect } from '../ui/group-by-period-select';
import Header from '../ui/header';
import { Skeleton } from '../ui/skeleton';
import { TraceMetricDatapoint } from '@/lib/traces/types';
import { useProjectContext } from '@/contexts/project-context';


interface CustomChartProps {
  className?: string;
  metric: string;
  aggregation: string;
  title: string;
  xAxisKey: string;
  yAxisKey: string;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  defaultGroupByInterval?: string;
  projectId: string;
  countComponent?: (data: TraceMetricDatapoint[]) => React.ReactNode;
}

export function CustomChart({
  className,
  metric,
  aggregation,
  title,
  xAxisKey,
  yAxisKey,
  pastHours,
  startDate,
  endDate,
  defaultGroupByInterval,
  countComponent,
  projectId
}: CustomChartProps) {
  const [data, setData] = useState<TraceMetricDatapoint[] | null>(null);

  const chartConfig = {
    [xAxisKey]: {
      color: 'hsl(var(--chart-2))'
    }
  } satisfies ChartConfig;

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      return;
    }
    const body: Record<string, any> = {
      metric,
      aggregation,
      groupByInterval: defaultGroupByInterval
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
    <div className={cn(className, 'flex flex-col space-y-2')}>
      <div className="py-2 flex-none">
        <div className="flex-col space-y-2 justify-between text-sm font-medium">
          <div className="flex-grow text-secondary-foreground">{title}</div>
          {countComponent && data && countComponent(data)}
        </div>
      </div>
      <div className="flex-1">
        {data === null ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full w-full"
          >
            <LineChart
              accessibilityLayer
              data={data}
              margin={{
                left: 0,
                right: 0
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                type="category"
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                tickFormatter={(value: number) =>
                  formatTimestampFromSecondsWithInterval(
                    value,
                    defaultGroupByInterval ?? 'hour'
                  )
                }
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
                content={
                  <ChartTooltipContent
                    labelKey={xAxisKey}
                    labelFormatter={(_: any, p: any) =>
                      formatTimestampFromSeconds(p[0].payload[xAxisKey])
                    }
                  />
                }
              />
              <Line dataKey={yAxisKey} dot={false} fill="hsl(var(--chart-1))" />
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

export interface DashboardProps { }

export default function Dashboard() {
  const { projectId } = useProjectContext();

  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;
  const groupByInterval =
    searchParams.get('groupByInterval') ??
    getGroupByInterval(pastHours, startDate, endDate, undefined);

  const router = useRouter();

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams);
      sp.set('pastHours', '24');
      router.replace(`/project/${projectId}/dashboard?${sp.toString()}`);
    }
  }, []);

  return (
    <>
      <Header path={'dashboard'}>
        <div className="h-12 flex space-x-2 items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
        </div>
      </Header>
      <div className="flex-grow flex flex-col">
        <div className="flex-1 space-y-8 p-4">
          <div className="flex-1">
            <CustomChart
              projectId={projectId}
              className="h-[40vh]"
              metric="traceCount"
              aggregation="Total"
              title="Traces"
              xAxisKey="time"
              yAxisKey="value"
              pastHours={pastHours}
              startDate={startDate}
              endDate={endDate}
              defaultGroupByInterval={groupByInterval}
              countComponent={(data: TraceMetricDatapoint[]) => (
                <span className="text-2xl">
                  {data?.reduce((acc, curr) => acc + curr.value, 0)}
                </span>
              )}
            />
          </div>
          <div className="flex space-x-4">
            <div className="flex-1">
              <CustomChart
                projectId={projectId}
                className="h-[40vh]"
                metric="traceLatencySeconds"
                aggregation="Average"
                title="Trace latency (avg)"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                countComponent={(data: TraceMetricDatapoint[]) => (
                  <span className="text-2xl">
                    {(
                      data?.reduce((acc, curr) => acc + curr.value, 0) /
                      data?.length
                    ).toFixed(2)}
                    s
                  </span>
                )}
              />
            </div>
            <div className="flex-1">
              <CustomChart
                projectId={projectId}
                className="h-[40vh]"
                metric="totalTokenCount"
                aggregation="Total"
                title="Tokens"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                countComponent={(data: TraceMetricDatapoint[]) => (
                  <span className="text-2xl">
                    {data?.reduce((acc, curr) => acc + curr.value, 0)}
                  </span>
                )}
              />
            </div>
            <div className="flex-1">
              <CustomChart
                projectId={projectId}
                className="h-[40vh]"
                metric="costUsd"
                aggregation="Total"
                title="Cost"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                countComponent={(data: TraceMetricDatapoint[]) => (
                  <span className="text-2xl">
                    {'$' +
                      data
                        ?.reduce((acc, curr) => acc + curr.value, 0)
                        .toFixed(5)}
                  </span>
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
