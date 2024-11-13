import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import {
  cn,
  formatTimestamp,
  formatTimestampWithInterval,
} from '@/lib/utils';
import { useEffect, useState } from 'react';
import { Skeleton } from '../ui/skeleton';
import { AggregationFunction } from '@/lib/clickhouse/utils';
import { MetricTimeValue, SpanMetric, SpanMetricGroupBy, SpanMetricType } from '@/lib/clickhouse/spans';
import { GroupByInterval } from '@/lib/clickhouse/modifiers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const xAxisKey = 'timestamp';

interface SpanStatChartProps {
  title: string;
  projectId: string;
  metric: SpanMetric;
  groupBy: SpanMetricGroupBy;
  pastHours: string;
  startDate: string;
  endDate: string;
  groupByInterval: GroupByInterval;
  aggregations?: AggregationFunction[];
  defaultAggregation?: AggregationFunction;
  className?: string;
  stackChart?: boolean;
}

export function SpanStatChart({
  className,
  metric,
  aggregations,
  defaultAggregation,
  groupBy,
  title,
  pastHours,
  startDate,
  endDate,
  groupByInterval,
  projectId,
  stackChart,
}: SpanStatChartProps) {
  const [data, setData] = useState<Record<string, any>[] | null>(null);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [aggregation, setAggregation] = useState<AggregationFunction>(defaultAggregation ?? aggregations?.[0] ?? 'SUM');

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      return;
    }
    const params: Record<string, any> = {
      metric,
      aggregation,
      groupByInterval,
      groupBy,
    };
    if (pastHours) {
      params['pastHours'] = pastHours;
    } else {
      params['startDate'] = startDate;
      params['endDate'] = endDate;
    }

    fetch(`/api/projects/${projectId}/spans/metrics/time?${new URLSearchParams(params).toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
    })
      .then((res) => res.json())
      .then((data: MetricTimeValue<SpanMetricType>[]) => {
        const keys = new Set(data.flatMap((d) => Object.keys(d.value).filter(k => k !== 'timestamp')));
        setData(data.map((d) => ({
          ...Object.fromEntries(Array.from(keys).map(k => [k, 0])),
          ...d.value,
          [xAxisKey]: d.time,
        })));
        setKeys(keys);
      });
  }, [groupByInterval, pastHours, startDate, endDate, groupBy, aggregation, projectId, metric]);

  const chartConfig = Object.fromEntries(Array.from(keys).map((key, index) => ([
    key, {
      color: `hsl(var(--chart-${index % 5 + 1}))`,
      label: key,
    }
  ]))) satisfies ChartConfig;

  return (
    <div className={cn(className, 'flex flex-col space-y-2')}>
      <div className="py-2 flex-none flex items-center space-x-2">
        <div className="flex space-x-2 justify-between text-sm font-medium">
          <div className="flex-grow text-secondary-foreground">{title}</div>
          {aggregations && (
            <Select
              value={aggregation}
              onValueChange={(value) => setAggregation(value as AggregationFunction)}
            >
              <SelectTrigger className="w-24 flex-none">
                <SelectValue placeholder="Select aggregation" />
              </SelectTrigger>
              <SelectContent>
                {aggregations.map((agg) => (
                  <SelectItem key={agg} value={agg}>{agg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="flex-1">
        {data === null ? (
          <Skeleton className="h-full w-full" />
        ) : (
          stackChart ? (
            <StackedBarChart
              data={data}
              keys={keys}
              xAxisKey={xAxisKey}
              chartConfig={chartConfig}
              groupByInterval={groupByInterval}
            />
          ) : (
            <DefaultLineChart
              data={data}
              keys={keys}
              xAxisKey={xAxisKey}
              chartConfig={chartConfig}
              groupByInterval={groupByInterval}
            />
          )
        )}
      </div>
    </div>
  );
}

interface ChartProps {
  data: Record<string, any>[],
  keys: Set<string>,
  xAxisKey: string,
  chartConfig: ChartConfig,
  groupByInterval: GroupByInterval
}

function StackedBarChart({
  data,
  keys,
  xAxisKey,
  chartConfig,
  groupByInterval
}: ChartProps) {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-full w-full"
    >
      <BarChart
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
            formatTimestampWithInterval(
              value,
              groupByInterval
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
                formatTimestamp(p[0].payload[xAxisKey])
              }
            />
          }
        />
        {Array.from(keys).map((key) => (
          <Bar
            dataKey={key}
            // dot={false}
            stroke={chartConfig[key].color}
            fill={chartConfig[key].color}
            key={key}
            stackId={'1'}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

function DefaultLineChart({
  data,
  keys,
  xAxisKey,
  chartConfig,
  groupByInterval
}: ChartProps) {
  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-full w-full"
    >
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          type="category"
          domain={['dataMin', 'dataMax']}
          tickLine={false}
          tickFormatter={(value) =>
            formatTimestampWithInterval(
              value,
              groupByInterval ?? 'hour'
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
          // cursor={false}
          content={
            <ChartTooltipContent
              labelKey={xAxisKey}
              labelFormatter={(_, p) =>
                formatTimestamp(`${p[0].payload[xAxisKey]}Z`)
              }
            />
          }
        />
        {Array.from(keys).map((key) => (
          <Line
            dataKey={key}
            dot={false}
            stroke={chartConfig[key].color}
            fill={chartConfig[key].color}
            key={key}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
