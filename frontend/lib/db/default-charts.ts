import { ChartType } from "@/components/chart-builder/types";
import { DashboardChart } from "@/components/dashboard/types";

const defaultCharts: Omit<DashboardChart, "id" | "createdAt">[] = [
  {
    name: "Top Spans",
    query:
      "\n        SELECT\n            name,\n            COUNT(span_id) AS value\n        FROM spans\n        WHERE\n          start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY name\n        ORDER BY value DESC\n        LIMIT 5\n    ",
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
        h: 4,
      },
    },
  },
  {
    name: "Top Model Cost",
    query:
      "\n        SELECT\n            model,\n            sum(total_cost) AS value\n        FROM spans\n        WHERE\n            model != '<null>'\n          AND span_type = 1\n          AND start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY model\n        ORDER BY value DESC\n        LIMIT 5\n    ",
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
        h: 4,
      },
    },
  },
  {
    name: "Top Model Tokens",
    query:
      "\n        SELECT\n            model,\n            sum(total_tokens) AS value\n        FROM spans\n        WHERE\n            model != '<null>'\n          AND span_type = 1\n          AND start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY model\n        ORDER BY value DESC\n        LIMIT 5\n    ",
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
        h: 4,
      },
    },
  },
  {
    name: "Top LLM Spans",
    query:
      "\n        SELECT\n            model,\n            COUNT(span_id) AS value\n        FROM spans\n        WHERE\n            model != '<null>'\n          AND span_type = 1\n          AND start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY model\n        ORDER BY value DESC\n            LIMIT 5\n    ",
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "value",
        y: "model",
      },
      layout: {
        x: 0,
        y: 3,
        w: 4,
        h: 4,
      },
    },
  },
  {
    name: "Latency by model (p90)",
    query:
      "\n        SELECT\n            CASE\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                ELSE toStartOfDay(start_time)\n                END AS time,\n            model,\n            quantile(0.9)(end_time - start_time) AS value\n        FROM spans\n        WHERE\n            model != '<null>'\n          AND span_type in [0, 1]\n          AND start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY time, model\n        ORDER BY time\n        WITH FILL\n        FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n            STEP CASE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n            ELSE INTERVAL 1 DAY\n        END\n            ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "model",
      },
      layout: {
        x: 4,
        y: 3,
        w: 4,
        h: 4,
      },
    },
  },
  {
    name: "Tokens by model (sum)",
    query:
      "\n        SELECT\n            CASE \n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                ELSE toStartOfDay(start_time)\n            END AS time,\n            model,\n            sum(total_tokens) AS value\n        FROM spans\n        WHERE\n            model != '<null>'\n            AND span_type in [0, 1]\n            AND start_time >= {start_time:DateTime64}\n            AND start_time <= {end_time:DateTime64}\n        GROUP BY time, model\n        ORDER BY time\n        WITH FILL\n        FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n            STEP CASE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n            ELSE INTERVAL 1 DAY\n        END\n    ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "model",
      },
      layout: {
        x: 8,
        y: 3,
        w: 4,
        h: 4,
      },
    },
  },
  {
    name: "Cost by model (sum)",
    query:
      "\n        SELECT\n            CASE \n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                ELSE toStartOfDay(start_time)\n            END AS time,\n            model,\n            sum(total_cost) AS value\n        FROM spans\n        WHERE\n            model != '<null>'\n            AND span_type in [0, 1]\n            AND start_time >= {start_time:DateTime64}\n            AND start_time <= {end_time:DateTime64}\n        GROUP BY time, model\n        ORDER BY time\n        WITH FILL\n        FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n            STEP CASE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n            ELSE INTERVAL 1 DAY\n        END\n    ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "model",
      },
      layout: {
        x: 0,
        y: 8,
        w: 4,
        h: 4,
      },
    },
  },
  {
    name: "Trace Status",
    query:
      "SELECT\n                CASE\n                    WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                    WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                    ELSE toStartOfDay(start_time)\n                    END as time,\n              CASE \n                  WHEN status = '' THEN 'success'\n                  ELSE 'error'\n            END as trace_status,\n              count() as value\n          FROM traces\n          WHERE start_time >= {start_time:DateTime64}\n            AND start_time <= {end_time:DateTime64}\n            AND trace_type = 0\n            AND status IN ('', 'error')\n          GROUP BY time, trace_status\n          ORDER BY time\n          WITH FILL\n          FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n              STEP CASE\n              WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n              WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n              ELSE INTERVAL 1 DAY\n          END\n            ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        breakdown: "trace_status",
      },
      layout: {
        x: 4,
        y: 8,
        w: 8,
        h: 4,
      },
    },
  },
  {
    name: "Trace latency (p90)",
    query:
      "\n        WITH trace_durations AS (\n            SELECT\n                CASE\n                    WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                    WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                    ELSE toStartOfDay(start_time)\n                    END as time,\n            toFloat64(COALESCE((toUnixTimestamp64Nano(end_time) - toUnixTimestamp64Nano(start_time)) / 1e9, 0)) as duration\n        FROM traces\n        WHERE start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n            )\n        SELECT\n            time,\n            toFloat64(COALESCE(quantileExact(0.90)(duration), 0)) as value\n        FROM trace_durations\n        GROUP BY time\n        ORDER BY time\n        WITH FILL\n        FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n            STEP CASE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n            ELSE INTERVAL 1 DAY\n        END\n    ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
      },
      layout: {
        x: 0,
        y: 12,
        w: 4,
        h: 4,
      },
    },
  },
  {
    name: "Total Tokens",
    query:
      "\n        SELECT\n            CASE\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                ELSE toStartOfDay(start_time)\n                END AS time,\n            sum(total_tokens) AS value\n        FROM spans\n        WHERE\n            span_type in [0, 1]\n          AND start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY time\n        ORDER BY time\n        WITH FILL\n        FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n            STEP CASE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n            ELSE INTERVAL 1 DAY\n        END\n    ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        total: true,
      },
      layout: {
        x: 4,
        y: 12,
        w: 4,
        h: 4,
      },
    },
  },
  {
    name: "Total cost",
    query:
      "\n        SELECT\n            CASE\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN toStartOfInterval(start_time, INTERVAL 5 MINUTE)\n                WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN toStartOfHour(start_time)\n                ELSE toStartOfDay(start_time)\n                END AS time,\n            sum(total_cost) AS value\n        FROM spans\n        WHERE\n            span_type in [0, 1]\n          AND start_time >= {start_time:DateTime64}\n          AND start_time <= {end_time:DateTime64}\n        GROUP BY time\n        ORDER BY time\n        WITH FILL\n        FROM toDateTime({start_time:DateTime64}) TO toDateTime({end_time:DateTime64})\n            STEP CASE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 3600 THEN INTERVAL 5 MINUTE\n            WHEN toUnixTimestamp({end_time:DateTime64}) - toUnixTimestamp({start_time:DateTime64}) <= 86400 THEN INTERVAL 1 HOUR\n            ELSE INTERVAL 1 DAY\n        END\n    ",
    settings: {
      config: {
        type: ChartType.LineChart,
        x: "time",
        y: "value",
        total: true,
      },
      layout: {
        x: 8,
        y: 12,
        w: 4,
        h: 4,
      },
    },
  },
];

export default defaultCharts;
