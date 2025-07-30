"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { ChartConfig, ChartType } from "@/components/chart-builder/types";
import { Chart } from "@/components/dashboard/chart";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

const CHARTS: { title: string; query: string; chartConfig: ChartConfig }[] = [
  {
    title: "Top Spans",
    query: `
        SELECT
            name,
            COUNT(span_id) AS value
        FROM spans
        WHERE
          start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY name
        ORDER BY value DESC
        LIMIT 5
    `,
    chartConfig: {
      total: true,
      type: ChartType.HorizontalBarChart,
      x: "value",
      y: "name",
    },
  },
  {
    title: "Top Model Cost",
    query: `
        SELECT
            model,
            sum(total_cost) AS value
        FROM spans
        WHERE
            model != '<null>'
          AND span_type = 1
          AND start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY model
        ORDER BY value DESC
        LIMIT 5
    `,
    chartConfig: {
      total: true,
      type: ChartType.HorizontalBarChart,
      x: "value",
      y: "model",
    },
  },
  {
    title: "Top Model Tokens",
    query: `
        SELECT
            model,
            sum(total_tokens) AS value
        FROM spans
        WHERE
            model != '<null>'
          AND span_type = 1
          AND start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY model
        ORDER BY value DESC
        LIMIT 5
    `,
    chartConfig: {
      total: true,
      type: ChartType.HorizontalBarChart,
      x: "value",
      y: "model",
    },
  },
  {
    title: "Top LLM Spans",
    query: `
        SELECT
            model,
            COUNT(span_id) AS value
        FROM spans
        WHERE
            model != '<null>'
          AND span_type = 1
          AND start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY model
        ORDER BY value DESC
            LIMIT 5
    `,
    chartConfig: {
      total: true,
      type: ChartType.HorizontalBarChart,
      x: "value",
      y: "model",
    },
  },

  {
    title: "Latency by model (p90)",
    query: `
        SELECT
            CASE
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
                END AS time,
            model,
            quantile(0.9)(end_time - start_time) AS value
        FROM spans
        WHERE
            model != '<null>'
          AND span_type in [0, 1]
          AND start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY time, model
        ORDER BY time
        WITH FILL
        FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
            STEP CASE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
            `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
      breakdown: "model",
    },
  },
  {
    title: "Tokens by model (sum)",
    query: `
        SELECT
            CASE 
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
            END AS time,
            model,
            sum(total_tokens) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type in [0, 1]
            AND start_time >= fromUnixTimestamp({start_time: UInt32})
            AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY time, model
        ORDER BY time
        WITH FILL
        FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
            STEP CASE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
    `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
      breakdown: "model",
    },
  },
  {
    title: "Cost by model (sum)",
    query: `
        SELECT
            CASE 
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
            END AS time,
            model,
            sum(total_cost) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type in [0, 1]
            AND start_time >= fromUnixTimestamp({start_time: UInt32})
            AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY time, model
        ORDER BY time
        WITH FILL
        FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
            STEP CASE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
    `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
      breakdown: "model",
    },
  },

  {
    title: "Trace latency (p90)",
    query: `
        WITH trace_durations AS (
            SELECT
                CASE
                    WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                    WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                    ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
                    END as time,
            toFloat64(COALESCE((toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1e9, 0)) as duration
        FROM traces
        WHERE start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
            )
        SELECT
            time,
            toFloat64(COALESCE(quantileExact(0.90)(duration), 0)) as value
        FROM trace_durations
        GROUP BY time
        ORDER BY time
        WITH FILL
        FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
            STEP CASE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
    `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
    },
  },
  {
    title: "Total Tokens",
    query: `
        SELECT
            CASE
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
                END AS time,
            sum(total_tokens) AS value
        FROM spans
        WHERE
            span_type in [0, 1]
          AND start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY time
        ORDER BY time
        WITH FILL
        FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
            STEP CASE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
    `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
      total: true,
    },
  },
  {
    title: "Total cost",
    query: `
        SELECT
            CASE
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
                END AS time,
            sum(total_cost) AS value
        FROM spans
        WHERE
            span_type in [0, 1]
          AND start_time >= fromUnixTimestamp({start_time: UInt32})
          AND start_time <= fromUnixTimestamp({end_time: UInt32})
        GROUP BY time
        ORDER BY time
        WITH FILL
        FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
            STEP CASE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
            WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
    `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
      total: true,
    },
  },
  {
    title: "Trace Status",
    query: `SELECT
                CASE
                    WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)   -- 1 hour or less: 5-minute intervals
                    WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN toStartOfHour(start_time)   -- 24 hours or less: hour intervals
                    ELSE toStartOfDay(start_time)  -- More than 24 hours: day intervals
                    END as time,
              CASE 
                  WHEN status = '' THEN 'success'
                  ELSE 'error'
            END as trace_status,
              count() as value
          FROM traces
          WHERE start_time >= fromUnixTimestamp({start_time: UInt32})
            AND start_time <= fromUnixTimestamp({end_time: UInt32})
            AND trace_type = 0
            AND status IN ('', 'error')
          GROUP BY time, trace_status
          ORDER BY time
          WITH FILL
          FROM fromUnixTimestamp({start_time: UInt32}) TO fromUnixTimestamp({end_time: UInt32})
              STEP CASE
              WHEN {end_time: UInt32} - {start_time: UInt32} <= 3600 THEN INTERVAL 5 MINUTE
              WHEN {end_time: UInt32} - {start_time: UInt32} <= 86400 THEN INTERVAL 1 HOUR
              ELSE INTERVAL 1 DAY
          END
            `,
    chartConfig: {
      type: ChartType.LineChart,
      x: "time",
      y: "value",
      breakdown: "trace_status",
    },
  },
];

export default function Dashboard() {
  const params = useParams();
  const projectId = params?.projectId as string;

  const searchParams = useSearchParams();
  const pastHours = searchParams.get("pastHours") || undefined;
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;

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
            {CHARTS.map((chart) => (
              <div className="col-span-1 h-72" key={chart.title}>
                <Chart name={chart.title} config={chart.chartConfig} query={chart.query} />
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
