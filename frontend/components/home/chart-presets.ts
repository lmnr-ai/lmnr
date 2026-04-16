export type PresetTable = "traces" | "spans" | "signals";

interface AxisPresetConfig {
  type: "line" | "bar" | "horizontalBar";
  x: string;
  y: string;
  breakdown?: string;
  total?: boolean;
  displayMode?: string;
}

interface TablePresetConfig {
  type: "table";
  hiddenColumns: string[];
}

export interface ChartPreset {
  name: string;
  table: PresetTable;
  query: string;
  config: AxisPresetConfig | TablePresetConfig;
}

export const CHART_PRESETS: ChartPreset[] = [
  {
    name: "Trace p90 cost",
    table: "traces",
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
    name: "Trace p90 duration",
    table: "traces",
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
    table: "traces",
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
    config: { x: "time", y: "count", type: "line", displayMode: "total", breakdown: "status" },
  },
  {
    name: "Total duration",
    table: "traces",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    sum(duration) AS \`sum_duration\`
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time
ORDER BY time WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "sum_duration", type: "line", displayMode: "total" },
  },
  {
    name: "Expensive traces",
    table: "traces",
    query: `SELECT
    top_span_name,
    total_cost,
    duration,
    id
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY total_cost DESC
LIMIT 10`,
    config: { type: "table", hiddenColumns: ["id"] },
  },
  {
    name: "Longest traces",
    table: "traces",
    query: `SELECT
    top_span_name,
    duration,
    total_cost,
    id
FROM traces
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY duration DESC
LIMIT 10`,
    config: { type: "table", hiddenColumns: ["id"] },
  },
  {
    name: "Total cost",
    table: "spans",
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
    config: { x: "time", y: "total_cost", type: "bar", displayMode: "total" },
  },
  {
    name: "Total tokens",
    table: "spans",
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
    config: { x: "time", y: "total_tokens", type: "line", displayMode: "total" },
  },
  {
    name: "Tokens by model",
    table: "spans",
    query: `SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    sum(total_tokens) AS \`total_tokens\`
FROM spans
WHERE
    model != '<null>'
    AND span_type = 'LLM'
    AND start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time ASC WITH FILL
    FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
    TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
    STEP toInterval(1, {interval_unit:String})`,
    config: { x: "time", y: "total_tokens", type: "line", breakdown: "model", displayMode: "none" },
  },
  {
    name: "Top span names",
    table: "spans",
    query: `SELECT
    name,
    count(span_id) AS \`count\`
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY name
ORDER BY count DESC
LIMIT 5`,
    config: { x: "count", y: "name", type: "horizontalBar", displayMode: "total" },
  },
  {
    name: "Expensive spans",
    table: "spans",
    query: `SELECT
    name,
    model,
    total_cost,
    duration,
    trace_id,
    span_id
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY total_cost DESC
LIMIT 10`,
    config: { type: "table", hiddenColumns: ["trace_id", "span_id"] },
  },
  {
    name: "Longest spans",
    table: "spans",
    query: `SELECT
    name,
    model,
    duration,
    total_cost,
    trace_id,
    span_id
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
ORDER BY duration DESC
LIMIT 10`,
    config: { type: "table", hiddenColumns: ["trace_id", "span_id"] },
  },
  {
    name: "Signal events",
    table: "signals",
    query: `SELECT
    name,
    count(*) AS \`count\`
FROM signal_events
WHERE
    timestamp >= {start_time:DateTime64}
    AND timestamp <= {end_time:DateTime64}
GROUP BY name
ORDER BY count DESC
LIMIT 10`,
    config: { x: "count", y: "name", type: "horizontalBar", displayMode: "total" },
  },
  {
    name: "Signal events table",
    table: "signals",
    query: `SELECT
    name,
    summary,
    timestamp,
    signal_id,
    trace_id
FROM signal_events
WHERE
    timestamp >= {start_time:DateTime64}
    AND timestamp <= {end_time:DateTime64}
ORDER BY timestamp DESC
LIMIT 50`,
    config: { type: "table", hiddenColumns: ["signal_id", "trace_id"] },
  },
];
