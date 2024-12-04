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
import { EventTemplate } from '@/lib/events/types';
import {
  cn,
  formatTimestampFromSeconds,
  getGroupByInterval
} from '@/lib/utils';

import DateRangeFilter from '../ui/date-range-filter';
import { GroupByPeriodSelect } from '../ui/group-by-period-select';
import { Skeleton } from '../ui/skeleton';

interface CustomChartProps {
  eventTemplate: EventTemplate;
  pastHours?: string;
  startDate?: string;
  endDate?: string;
  className?: string;
  defaultGroupByInterval?: string;
}

export function CustomChart({
  eventTemplate,
  className,
  pastHours,
  startDate,
  endDate,
  defaultGroupByInterval
}: CustomChartProps) {
  const [xAxisKey, setXAxisKey] = useState<string>('time');
  const [yAxisKey, setYAxisKey] = useState<string>('value');
  const [data, setData] = useState<any[] | null>(null);

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
    let url = `/api/projects/${eventTemplate.projectId}/event-templates/${eventTemplate.id}/metrics?metric=eventCount&aggregation=Total&groupByInterval=${inferredGroupBy}`;
    if (pastHours !== null) {
      url += `&pastHours=${pastHours}`;
    }
    if (startDate != null) {
      url += `&startDate=${startDate}`;
    }
    if (endDate != null) {
      url += `&endDate=${endDate}`;
    }

    fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }).then((res) =>
      res.json().then((data: any) => {
        setData(data);
      })
    );
  }, [eventTemplate, pastHours, startDate, endDate, defaultGroupByInterval]);

  return (
    <div className={cn(className, 'border')}>
      <div className="p-4">
        <div className="flex space-x-2 justify-between text-sm font-medium">
          <div className="flex-grow text-lg text-secondary-foreground">
            {eventTemplate.name}
          </div>
        </div>
      </div>
      <div className="">
        {data === null ? (
          <Skeleton />
        ) : (
          <ChartContainer config={chartConfig}>
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

export interface DashboardProps {
  eventTemplates: EventTemplate[];
}

export default function Dashboard({ eventTemplates }: DashboardProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;
  const groupByInterval = searchParams.get('groupByInterval') as
    | string
    | undefined;
  return (
    <div className="flex-grow flex flex-col space-y-4">
      <div className="h-12 flex space-x-2 items-center border-b">
        <DateRangeFilter />
        <GroupByPeriodSelect />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {eventTemplates.map((eventTemplate) => (
          <div key={`event-${eventTemplate.id}`} className="flex-1">
            <CustomChart
              eventTemplate={eventTemplate}
              pastHours={pastHours}
              startDate={startDate}
              endDate={endDate}
              defaultGroupByInterval={groupByInterval}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
