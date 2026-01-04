import { ChartType } from "@/components/chart-builder/types";
import { type DashboardChart } from "@/components/dashboard/types";

const defaultCharts: Omit<DashboardChart, "id" | "createdAt">[] = [
  {
    name: "Top spans",
    query: `
SELECT
    name,
    COUNT(span_id) AS count
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY name
ORDER BY count DESC
LIMIT 5
    `,
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "count",
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
    sum(total_cost) AS total_cost
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY model
ORDER BY total_cost DESC
LIMIT 5
    `,
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "total_cost",
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
    sum(total_tokens) AS total_tokens
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY model
ORDER BY total_tokens DESC
    LIMIT 5
    `,
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "total_tokens",
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
    COUNT(span_id) AS count
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY model
ORDER BY count DESC
    LIMIT 5
    `,
    settings: {
      config: {
        total: true,
        type: ChartType.HorizontalBarChart,
        x: "count",
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
    quantile(0.9)(duration) AS duration
FROM spans
WHERE
    span_type = 'LLM'
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
        y: "duration",
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
    sum(total_tokens) AS total_tokens
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
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
        y: "total_tokens",
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
    sum(total_cost) AS total_cost
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
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
        y: "total_cost",
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
SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    status,
    count(*) AS count
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time, status
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
        y: "count",
        breakdown: "status",
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
    quantile(0.9)(duration) AS duration
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
        y: "duration",
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
    sum(total_tokens) AS total_tokens
FROM spans
WHERE
    span_type = 'LLM'
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
        y: "total_tokens",
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
    sum(total_cost) AS total_cost
FROM spans
WHERE
    span_type = 'LLM'
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
        y: "total_cost",
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
