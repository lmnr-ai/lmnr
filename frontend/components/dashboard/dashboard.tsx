"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { useProjectContext } from "@/contexts/project-context";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/spans";
import { AggregationFunction } from "@/lib/clickhouse/utils";
import { getGroupByInterval } from "@/lib/utils";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";
import { LabelStatChart } from "./labels-stat-chart";
import { SpanStatChart } from "./span-stat-chart";
import SpanSummaryChart from "./span-summary-chart";
import { TraceStatChart } from "./trace-stat-chart";

const AGGREGATIONS: AggregationFunction[] = ["AVG", "MEDIAN", "SUM", "MIN", "MAX", "p90", "p95", "p99"];

const SPAN_SUMMARY_CHARTS = [
  {
    title: "Spans",
    metric: SpanMetric.Count,
    groupBy: SpanMetricGroupBy.Name,
  },
  {
    title: "Cost",
    metric: SpanMetric.TotalCost,
    groupBy: SpanMetricGroupBy.Model,
  },
  {
    title: "Tokens",
    metric: SpanMetric.TotalTokens,
    groupBy: SpanMetricGroupBy.Model,
  },
  {
    title: "Spans by model",
    metric: SpanMetric.Count,
    groupBy: SpanMetricGroupBy.Model,
  },
];

export default function Dashboard() {
  const { projectId } = useProjectContext();

  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get("pastHours") as string | undefined;
  const startDate = searchParams.get("startDate") as string | undefined;
  const endDate = searchParams.get("endDate") as string | undefined;
  const groupByInterval =
    searchParams.get("groupByInterval") ?? getGroupByInterval(pastHours, startDate, endDate, undefined);

  const router = useRouter();

  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams);
      sp.set("pastHours", "24");
      router.replace(`/project/${projectId}/dashboard?${sp.toString()}`);
    }
  }, []);

  return (
    <>
      <Header path={"dashboard"}>
        <div className="h-12 flex space-x-2 items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
        </div>
      </Header>
      <div className="flex-grow flex flex-col h-0">
        <ScrollArea className="h-full">
          <div className="grid grid-cols-3 gap-4 p-4">
            {SPAN_SUMMARY_CHARTS.map((chart) => (
              <div className="col-span-1 h-72" key={chart.title}>
                <SpanSummaryChart
                  {...chart}
                  className="w-full"
                  projectId={projectId}
                  pastHours={pastHours ?? ""}
                  startDate={startDate ?? ""}
                  endDate={endDate ?? ""}
                  addDollarSign={chart.metric === SpanMetric.TotalCost}
                />
              </div>
            ))}
            <div className="col-span-1">
              <SpanStatChart
                title="Latency by model"
                projectId={projectId}
                className="w-full"
                metric={SpanMetric.Latency}
                defaultAggregation="p90"
                aggregations={AGGREGATIONS}
                groupBy={SpanMetricGroupBy.Model}
                pastHours={pastHours ?? ""}
                startDate={startDate ?? ""}
                endDate={endDate ?? ""}
                groupByInterval={groupByInterval as GroupByInterval}
              />
            </div>
            <div className="col-span-1 h-72">
              <SpanStatChart
                title="Tokens by model"
                projectId={projectId}
                className="w-full"
                metric={SpanMetric.TotalTokens}
                aggregations={AGGREGATIONS}
                defaultAggregation="SUM"
                groupBy={SpanMetricGroupBy.Model}
                pastHours={pastHours ?? ""}
                startDate={startDate ?? ""}
                endDate={endDate ?? ""}
                groupByInterval={groupByInterval as GroupByInterval}
              />
            </div>
            <div className="col-span-1 h-72">
              <SpanStatChart
                title="Cost by model"
                projectId={projectId}
                className="w-full"
                metric={SpanMetric.TotalCost}
                aggregations={AGGREGATIONS}
                defaultAggregation="SUM"
                groupBy={SpanMetricGroupBy.Model}
                pastHours={pastHours ?? ""}
                startDate={startDate ?? ""}
                endDate={endDate ?? ""}
                groupByInterval={groupByInterval as GroupByInterval}
              />
            </div>
            <div className="col-span-2 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="traceCount"
                aggregation="Total"
                title="Traces"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
              />
            </div>
            <div className="col-span-1 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="traceLatencySeconds"
                aggregation="P90"
                title="Trace latency (p90)"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                showTotal={false}
              />
            </div>
            <div className="col-span-1 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="totalTokenCount"
                aggregation="Total"
                title="Tokens"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
              />
            </div>
            <div className="col-span-1 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="costUsd"
                aggregation="Total"
                title="Total cost"
                xAxisKey="time"
                yAxisKey="value"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                addDollarSign={true}
              />
            </div>
            <div className="col-span-3 h-72">
              <LabelStatChart
                title="Labels Frequency"
                projectId={projectId}
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                showTotal
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
