import "react-grid-layout/css/styles.css";
import "./styles.css";

import React, { useMemo } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";

import { ChartConfig, ChartType } from "@/components/chart-builder/types";
import Chart from "@/components/dashboard/chart";

const ResponsiveGridLayout = WidthProvider(Responsive);
const CHARTS: {
  title: string;
  query: string;
  settings: {
    config: ChartConfig;
    layout: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
  };
}[] = [
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
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "value",
        y: "name",
      },
      layout: { x: 0, y: 0, w: 4, h: 4 },
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
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "value",
        y: "model",
      },
      layout: { x: 4, y: 0, w: 4, h: 4 },
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
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "value",
        y: "model",
      },
      layout: { x: 8, y: 0, w: 4, h: 4 },
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
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "value",
        y: "model",
      },
      layout: { x: 0, y: 3, w: 4, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "model",
      },
      layout: { x: 4, y: 3, w: 4, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "model",
      },
      layout: { x: 8, y: 3, w: 4, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "model",
      },
      layout: { x: 0, y: 8, w: 4, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "trace_status",
      },
      layout: { x: 4, y: 8, w: 8, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
      },
      layout: { x: 0, y: 12, w: 4, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        total: true,
      },
      layout: { x: 4, y: 12, w: 4, h: 4 },
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
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        total: true,
      },
      layout: { x: 8, y: 12, w: 4, h: 4 },
    },
  },
];

const GridLayout = () => {
  const layout = CHARTS.map((chart) => ({
    i: chart.title,
    ...chart.settings.layout,
  }));

  const children = useMemo(
    () =>
      CHARTS.map((chart) => (
        <div key={chart.title} className="rounded-lg">
          <Chart name={chart.title} config={chart.settings.config} query={chart.query} />
        </div>
      )),
    []
  );

  return (
    <ResponsiveGridLayout
      className="layout"
      useCSSTransforms
      layouts={{ lg: layout, md: layout }}
      breakpoints={{ lg: 1200, md: 996 }}
      cols={{ lg: 12, md: 10 }}
      rowHeight={60}
      isDraggable={true}
      isResizable={true}
      margin={[16, 16]}
      draggableHandle=".drag-handle"
      containerPadding={[0, 0]}
    >
      {children}
    </ResponsiveGridLayout>
  );
};

export default GridLayout;
