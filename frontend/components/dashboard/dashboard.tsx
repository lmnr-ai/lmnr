'use client';

import { getGroupByInterval } from '@/lib/utils';
import { useEffect } from 'react';
import DateRangeFilter from '../ui/date-range-filter';
import { useRouter, useSearchParams } from 'next/navigation';
import { GroupByPeriodSelect } from '../ui/group-by-period-select';
import { TraceMetricDatapoint } from '@/lib/traces/types';
import Header from '../ui/header';
import { useProjectContext } from '@/contexts/project-context';
import { TraceStatChart } from './trace-stat-chart';
import { SpanStatChart } from './span-stat-chart';
import { SpanMetricGroupBy } from '@/lib/clickhouse/spans';
import { SpanMetric } from '@/lib/clickhouse/spans';
import { GroupByInterval } from '@/lib/clickhouse/modifiers';
import { ScrollArea } from '../ui/scroll-area';
import { AggregationFunction } from '@/lib/clickhouse/utils';
import SpanSummaryChart from './span-summary-chart';

const AGGREGATIONS: AggregationFunction[] = [
  'AVG',
  'MEDIAN',
  'SUM',
  'MIN',
  'MAX',
  'p90',
  'p95',
  'p99'
];


const SPAN_SUMMARY_CHARTS = [
  {
    title: 'Spans',
    metric: SpanMetric.Count,
    groupBy: SpanMetricGroupBy.Name,
  },
  {
    title: 'Cost',
    metric: SpanMetric.TotalCost,
    groupBy: SpanMetricGroupBy.Model,
  },
  {
    title: 'Tokens',
    metric: SpanMetric.TotalTokens,
    groupBy: SpanMetricGroupBy.Model,
  },
  {
    title: 'Spans by model',
    metric: SpanMetric.Count,
    groupBy: SpanMetricGroupBy.Model,
  }
];

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
      <div className="flex-grow flex flex-col h-0">
        <ScrollArea className="h-full">
          <div className="flex-1 space-y-8 p-4">
            <div className="grid grid-cols-3 gap-4">
              {SPAN_SUMMARY_CHARTS.map((chart) => (
                <div className="col-span-1" key={chart.title}>
                  <SpanSummaryChart
                    {...chart}
                    className="w-full"
                    projectId={projectId}
                    pastHours={pastHours ?? ''}
                    startDate={startDate ?? ''}
                    endDate={endDate ?? ''}
                  />
                </div>
              ))}
            </div>
            <div className="flex space-x-4">
              <div className="flex-1">
                <SpanStatChart
                  title="Span latency, s"
                  projectId={projectId}
                  className="h-[40vh] w-full"
                  metric={SpanMetric.Latency}
                  defaultAggregation="p90"
                  aggregations={AGGREGATIONS}
                  groupBy={SpanMetricGroupBy.Model}
                  pastHours={pastHours ?? ''}
                  startDate={startDate ?? ''}
                  endDate={endDate ?? ''}
                  groupByInterval={groupByInterval as GroupByInterval}
                />
              </div>
              <div className="flex-1">
                <SpanStatChart
                  title="Tokens"
                  projectId={projectId}
                  className="h-[40vh] w-full"
                  metric={SpanMetric.TotalTokens}
                  aggregations={AGGREGATIONS}
                  defaultAggregation="SUM"
                  groupBy={SpanMetricGroupBy.Model}
                  pastHours={pastHours ?? ''}
                  startDate={startDate ?? ''}
                  endDate={endDate ?? ''}
                  groupByInterval={groupByInterval as GroupByInterval}
                />
              </div>
              <div className="flex-1">
                <SpanStatChart
                  title="Cost"
                  projectId={projectId}
                  className="h-[40vh] w-full"
                  metric={SpanMetric.TotalCost}
                  aggregations={AGGREGATIONS}
                  defaultAggregation="SUM"
                  groupBy={SpanMetricGroupBy.Model}
                  pastHours={pastHours ?? ''}
                  startDate={startDate ?? ''}
                  endDate={endDate ?? ''}
                  groupByInterval={groupByInterval as GroupByInterval}
                />
              </div>
            </div>
            <div className="flex-1">
              <TraceStatChart
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
                <TraceStatChart
                  projectId={projectId}
                  className="h-[40vh]"
                  metric="traceLatencySeconds"
                  aggregation="P90"
                  title="Trace latency (p90)"
                  xAxisKey="time"
                  yAxisKey="value"
                  pastHours={pastHours}
                  startDate={startDate}
                  endDate={endDate}
                  defaultGroupByInterval={groupByInterval}
                  countComponent={() => <></>}
                />
              </div>
              <div className="flex-1">
                <TraceStatChart
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
                <TraceStatChart
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
        </ScrollArea>
      </div>
    </>
  );
}
