import { useEffect, useState } from 'react';

import {
  ChartConfig
} from '@/components/ui/chart';
import { GroupByInterval } from '@/lib/clickhouse/modifiers';
import { TraceMetricDatapoint } from '@/lib/traces/types';
import {
  cn,
  formatTimestampFromSeconds,
  toFixedIfFloat,
} from '@/lib/utils';

import { Skeleton } from '../ui/skeleton';
import { DefaultLineChart } from './span-stat-chart';


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
  addDollarSign?: boolean;
  showTotal?: boolean;
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
  addDollarSign = false,
  showTotal = true,
  projectId
}: TraceStartChartProps) {
  const [data, setData] = useState<TraceMetricDatapoint[] | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);

  const chartConfig = {
    "value": {
      color: 'hsl(var(--chart-1))'
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
        const total = data.reduce((sum: number, point: TraceMetricDatapoint) => sum + point.value, 0);
        setTotalCount(total);
      });
  }, [defaultGroupByInterval, pastHours, startDate, endDate, aggregation, metric, projectId]);

  return (
    <div className={cn(className, 'flex flex-col space-y-2 border rounded-lg p-4 h-full border-dashed border-border')}>
      <div className="flex-none">
        <div className="flex-col space-y-2 justify-between text-sm font-medium">
          <div className="flex justify-between items-center">
            <div className="flex-grow text-secondary-foreground">{title}</div>
          </div>
        </div>
      </div>
      {showTotal && (
        <div className="text-2xl font-medium">
          {addDollarSign ? `$${toFixedIfFloat(totalCount)}` : toFixedIfFloat(totalCount)}
        </div>
      )}
      <div className="flex-1">
        {data === null ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <DefaultLineChart
            data={data?.map((d) => ({
              "value": d.value,
              "timestamp": formatTimestampFromSeconds(d.time)
            })) ?? []}
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
