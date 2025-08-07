import { ChartType } from "@/components/chart-builder/types";
import { DashboardChart } from "@/components/dashboard/types";

const defaultCharts: Omit<DashboardChart, "id" | "createdAt">[] = [
  {
    name: "Top spans",
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
    name: "Top model cost",
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
    name: "Top model tokens",
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
    name: "Top LLM spans",
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
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    quantile(0.9)(end_time - start_time) AS value
FROM spans
WHERE
    model != '<null>'
  AND span_type = 1
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
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
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    sum(total_tokens) AS value
FROM spans
WHERE
    model != '<null>'
  AND span_type = 1
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
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
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    sum(total_cost) AS value
FROM spans
WHERE
    model != '<null>'
  AND span_type = 1
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
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
    name: "Trace status",
    query: `
WITH traces_data AS (
    SELECT
        toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    status,
    count() AS value
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
  AND trace_type = 0
  AND status IN ('', 'error')
GROUP BY time, status
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
    )
SELECT
    time,
    CASE
    WHEN status = 'error' THEN 'error'
    ELSE 'success'
END AS trace_status,
value
FROM traces_data
ORDER BY time, trace_status
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
    name: "Trace duration (p90)",
    query: `
SELECT
  toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
toFloat64(COALESCE(quantileExact(0.90)(duration), 0)) AS value
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
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
    name: "Total tokens",
    query: `
SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    sum(total_tokens) AS value
FROM spans
WHERE
    span_type = 1
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
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
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    sum(total_cost) AS value
FROM spans
WHERE
    span_type = 1
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
  TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})
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
