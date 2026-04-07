export interface ChartPreset {
  name: string;
  query: string;
  config: {
    type: string;
    x: string;
    y: string;
    breakdown?: string;
    total?: boolean;
    displayMode?: string;
  };
}

export const CHART_PRESETS: ChartPreset[] = [
  {
    name: "Trace p90 cost",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    quantile(0.9)(total_cost) AS \`p90_total_cost\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time ASC WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "p90_total_cost", type: "line", displayMode: "average" },
  },
  {
    name: "Trace p90 duration (s)",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    quantile(0.9)(duration) AS \`p90_duration\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time ASC WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "p90_duration", type: "line", displayMode: "average" },
  },
  {
    name: "New traces",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    status,
    count(*) AS \`count\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time, status
ORDER BY time ASC WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "count", type: "line", total: true, breakdown: "status" },
  },
  {
    name: "Total cost",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    sum(total_cost) AS total_cost
FROM spans
WHERE
    span_type = 'LLM'
    AND start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "total_cost", type: "bar", total: true },
  },
  {
    name: "Total tokens",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    sum(total_tokens) AS total_tokens
FROM spans
WHERE
    span_type = 'LLM'
    AND start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "total_tokens", type: "line", total: true },
  },
  {
    name: "Tokens by model (sum)",
    query: `SELECT
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
ORDER BY time WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "total_tokens", type: "line", breakdown: "model" },
  },
  {
    name: "Latency by model (p90)",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    quantile(0.9)(duration) AS duration
FROM spans
WHERE
    span_type = 'LLM'
    AND start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "duration", type: "line", breakdown: "model" },
  },
  {
    name: "Cost by model (sum)",
    query: `SELECT
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
ORDER BY time WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "total_cost", type: "line", breakdown: "model" },
  },
  {
    name: "Top spans",
    query: `SELECT
    name,
    COUNT(span_id) AS count
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY name
ORDER BY count DESC
LIMIT 5`,
    config: { x: "count", y: "name", type: "horizontalBar", total: true },
  },
  {
    name: "Top model tokens",
    query: `SELECT
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
LIMIT 5`,
    config: { x: "total_tokens", y: "model", type: "horizontalBar", total: true },
  },
  {
    name: "Longest traces (m)",
    query: `SELECT
    (duration / 60) AS \`value\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY value DESC
LIMIT 5`,
    config: { x: "value", y: "value", type: "horizontalBar", displayMode: "none" },
  },
  {
    name: "Longest spans (m)",
    query: `SELECT
    (duration / 60) AS \`value\`
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY value DESC
LIMIT 5`,
    config: { x: "value", y: "value", type: "horizontalBar", displayMode: "none" },
  },
  {
    name: "Expensive traces",
    query: `SELECT
    (total_cost) AS \`value\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY value DESC
LIMIT 5`,
    config: { x: "value", y: "value", type: "horizontalBar", displayMode: "none" },
  },
  {
    name: "Expensive spans",
    query: `SELECT
    (total_cost) AS \`value\`
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY value DESC
LIMIT 5`,
    config: { x: "value", y: "value", type: "horizontalBar", displayMode: "none" },
  },
  {
    name: "Signal events",
    query: `SELECT
    name,
    count(*) AS \`count\`
FROM signal_events
WHERE
    timestamp >= {start_time:DateTime64}
    AND timestamp <= {end_time:DateTime64}
GROUP BY name
ORDER BY count DESC`,
    config: { x: "count", y: "name", type: "horizontalBar", displayMode: "total" },
  },
  {
    name: "Trace status",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    status,
    count(*) AS \`count\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time, status
ORDER BY time ASC WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "count", type: "line", breakdown: "status" },
  },
];
