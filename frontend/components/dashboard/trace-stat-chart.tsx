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
} from '@/lib/utils';
import { useEffect, useState } from 'react';
import { Skeleton } from '../ui/skeleton';
import { TraceMetricDatapoint } from '@/lib/traces/types';
import { GroupByInterval } from '@/lib/clickhouse/modifiers';


interface TraceStartChartProps {
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

export function TraceStatChart({
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
}: TraceStartChartProps) {
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
                tickFormatter={(value) =>
                  formatTimestampFromSecondsWithInterval(
                    value,
                    defaultGroupByInterval as GroupByInterval
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
                    labelFormatter={(_, p) =>
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
