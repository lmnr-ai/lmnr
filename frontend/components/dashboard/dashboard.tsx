"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import SpanStatChart from "@/components/dashboard/span-stat-chart";
import SpanSummaryChart from "@/components/dashboard/span-summary-chart";
import TraceStatChart from "@/components/dashboard/trace-stat-chart";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { AggregationFunction, SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/types";
import { getGroupByInterval } from "@/lib/utils";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";
import { TraceStatusChart } from "./trace-status-chart";

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
  const params = useParams();
  const projectId = params?.projectId as string;

  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pastHours = searchParams.get("pastHours") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
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
                defaultAggregation={AggregationFunction.p90}
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
                defaultAggregation={AggregationFunction.SUM}
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
                defaultAggregation={AggregationFunction.SUM}
                groupBy={SpanMetricGroupBy.Model}
                pastHours={pastHours ?? ""}
                startDate={startDate ?? ""}
                endDate={endDate ?? ""}
                groupByInterval={groupByInterval as GroupByInterval}
              />
            </div>
            <div className="col-span-2 h-72">
              <TraceStatusChart
                projectId={projectId}
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                title="Trace Status"
              />
            </div>
            <div className="col-span-1 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="traceLatencySeconds"
                aggregation={AggregationFunction.p90}
                title="Trace latency (p90)"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
              />
            </div>
            <div className="col-span-1 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="totalTokenCount"
                aggregation={AggregationFunction.SUM}
                title="Tokens"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                showTotal
              />
            </div>
            <div className="col-span-1 h-72">
              <TraceStatChart
                projectId={projectId}
                metric="costUsd"
                aggregation={AggregationFunction.SUM}
                title="Total cost"
                pastHours={pastHours}
                startDate={startDate}
                endDate={endDate}
                defaultGroupByInterval={groupByInterval}
                addDollarSign={true}
                showTotal
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
