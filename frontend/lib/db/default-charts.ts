import { ChartType } from "@/components/chart-builder/types";
import { DashboardChart } from "@/components/dashboard/types";

const defaultCharts: Omit<DashboardChart, "id" | "createdAt">[] = [
  {
    name: "Top Spans",
    query: `
        SELECT
            name,
            COUNT(span_id) AS value
        FROM spans
        WHERE
            start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
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
      layout: {
        x: 0,
        y: 0,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Top Model Cost",
    query: `
        SELECT
            model,
            sum(total_cost) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type = 1
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
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
      layout: {
        x: 4,
        y: 0,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Top Model Tokens",
    query: `
        SELECT
            model,
            sum(total_tokens) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type = 1
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
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
      layout: {
        x: 8,
        y: 0,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Top LLM Spans",
    query: `
        SELECT
            model,
            COUNT(span_id) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type = 1
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
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
      layout: {
        x: 0,
        y: 6,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Latency by model (p90)",
    query: `
        SELECT
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour(start_time)
                ELSE toStartOfDay(start_time)
            END AS time,
            model,
            quantile(0.9)(end_time - start_time) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type IN [0, 1]
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
        GROUP BY time, model
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
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
      layout: {
        x: 4,
        y: 6,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Tokens by model (sum)",
    query: `
        SELECT
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour(start_time)
                ELSE toStartOfDay(start_time)
            END AS time,
            model,
            sum(total_tokens) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type IN [0, 1]
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
        GROUP BY time, model
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
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
      layout: {
        x: 8,
        y: 6,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Cost by model (sum)",
    query: `
        SELECT
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour(start_time)
                ELSE toStartOfDay(start_time)
            END AS time,
            model,
            sum(total_cost) AS value
        FROM spans
        WHERE
            model != '<null>'
            AND span_type IN [0, 1]
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
        GROUP BY time, model
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
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
      layout: {
        x: 0,
        y: 12,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Trace Status",
    query: `
        SELECT
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour(start_time)
                ELSE toStartOfDay(start_time)
            END AS time,
            CASE 
                WHEN status = '' THEN 'success'
                ELSE 'error'
            END AS trace_status,
            count() AS value
        FROM traces
        WHERE
            start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
            AND trace_type = 0
            AND status IN ('', 'error')
        GROUP BY time, trace_status
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
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
      layout: {
        x: 4,
        y: 12,
        w: 8,
        h: 6,
      },
    },
  },
  {
    name: "Trace latency (p90)",
    query: `
        WITH trace_durations AS (
            SELECT
                CASE
                    WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                        THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                    WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                        THEN toStartOfHour(start_time)
                    ELSE toStartOfDay(start_time)
                END AS time,
                toFloat64(COALESCE((toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1e9, 0)) AS duration
            FROM traces
            WHERE
                start_time >= {start_time:DateTime64}
                AND start_time <= {end_time:DateTime64}
        )
        SELECT
            time,
            toFloat64(COALESCE(quantileExact(0.90)(duration), 0)) AS value
        FROM trace_durations
        GROUP BY time
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
            ELSE INTERVAL 1 DAY
        END
    `,
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
      },
      layout: {
        x: 0,
        y: 18,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Total Tokens",
    query: `
        SELECT
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour(start_time)
                ELSE toStartOfDay(start_time)
            END AS time,
            sum(total_tokens) AS value
        FROM spans
        WHERE
            span_type IN [0, 1]
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
        GROUP BY time
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
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
      layout: {
        x: 4,
        y: 18,
        w: 4,
        h: 6,
      },
    },
  },
  {
    name: "Total cost",
    query: `
        SELECT
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour(start_time)
                ELSE toStartOfDay(start_time)
            END AS time,
            sum(total_cost) AS value
        FROM spans
        WHERE
            span_type IN [0, 1]
            AND start_time >= {start_time:DateTime64}
            AND start_time <= {end_time:DateTime64}
        GROUP BY time
        ORDER BY time
        WITH FILL
        FROM (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({start_time:DateTime64})
                ELSE toStartOfDay({start_time:DateTime64})
            END
        ) TO (
            CASE
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                    THEN toStartOfInterval({end_time:DateTime64}, INTERVAL 5 MINUTE)
                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                    THEN toStartOfHour({end_time:DateTime64})
                ELSE toStartOfDay({end_time:DateTime64})
            END
        )
        STEP CASE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600
                THEN INTERVAL 5 MINUTE
            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400
                THEN INTERVAL 1 HOUR
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
      layout: {
        x: 8,
        y: 18,
        w: 4,
        h: 6,
      },
    },
  },
];

export default defaultCharts;
