import { type QueryStructure } from "@/lib/actions/sql/types";

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
}

export interface ChartPreset {
  name: string;
  table: PresetTable;
  query: string;
  queryStructure: QueryStructure;
  config: AxisPresetConfig | TablePresetConfig;
}

// The default timeRange Form.tsx generates at execute time for time-series
// charts. Presets for line/bar charts should use this so their saved
// queryStructure round-trips identically to what the form produces.
const TIME_SERIES_TIME_RANGE = (column: string): QueryStructure["timeRange"] => ({
  column,
  from: "{start_time:DateTime64}",
  to: "{end_time:DateTime64}",
  fillGaps: true,
  intervalValue: "1",
  intervalUnit: "{interval_unit:String}",
});

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
    queryStructure: {
      table: "traces",
      metrics: [{ fn: "quantile", column: "total_cost", alias: "p90_total_cost", args: [0.9] }],
      dimensions: [],
      filters: [],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
    queryStructure: {
      table: "traces",
      metrics: [{ fn: "quantile", column: "duration", alias: "p90_duration", args: [0.9] }],
      dimensions: [],
      filters: [],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
    queryStructure: {
      table: "traces",
      metrics: [{ fn: "count", column: "*", alias: "count", args: [] }],
      dimensions: ["status"],
      filters: [],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
    queryStructure: {
      table: "traces",
      metrics: [{ fn: "sum", column: "duration", alias: "sum_duration", args: [] }],
      dimensions: [],
      filters: [],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
ORDER BY total_cost DESC`,
    queryStructure: {
      table: "traces",
      metrics: [
        { fn: "raw", column: "top_span_name", alias: "top_span_name", args: [] },
        { fn: "raw", column: "total_cost", alias: "total_cost", args: [] },
        { fn: "raw", column: "duration", alias: "duration", args: [] },
        { fn: "raw", column: "id", alias: "id", args: [], hidden: true },
      ],
      dimensions: [],
      filters: [],
      orderBy: [{ field: "total_cost", dir: "desc" }],
    },
    config: { type: "table" },
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
ORDER BY duration DESC`,
    queryStructure: {
      table: "traces",
      metrics: [
        { fn: "raw", column: "top_span_name", alias: "top_span_name", args: [] },
        { fn: "raw", column: "duration", alias: "duration", args: [] },
        { fn: "raw", column: "total_cost", alias: "total_cost", args: [] },
        { fn: "raw", column: "id", alias: "id", args: [], hidden: true },
      ],
      dimensions: [],
      filters: [],
      orderBy: [{ field: "duration", dir: "desc" }],
    },
    config: { type: "table" },
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
    queryStructure: {
      table: "spans",
      metrics: [{ fn: "sum", column: "total_cost", alias: "total_cost", args: [] }],
      dimensions: [],
      filters: [{ field: "span_type", op: "eq", stringValue: "LLM" }],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
    queryStructure: {
      table: "spans",
      metrics: [{ fn: "sum", column: "total_tokens", alias: "total_tokens", args: [] }],
      dimensions: [],
      filters: [{ field: "span_type", op: "eq", stringValue: "LLM" }],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
    queryStructure: {
      table: "spans",
      metrics: [{ fn: "sum", column: "total_tokens", alias: "total_tokens", args: [] }],
      dimensions: ["model"],
      filters: [
        { field: "model", op: "ne", stringValue: "<null>" },
        { field: "span_type", op: "eq", stringValue: "LLM" },
      ],
      timeRange: TIME_SERIES_TIME_RANGE("start_time"),
      orderBy: [],
    },
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
    queryStructure: {
      table: "spans",
      metrics: [{ fn: "count", column: "span_id", alias: "count", args: [] }],
      dimensions: ["name"],
      filters: [],
      orderBy: [{ field: "count", dir: "desc" }],
      limit: 5,
    },
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
ORDER BY total_cost DESC`,
    queryStructure: {
      table: "spans",
      metrics: [
        { fn: "raw", column: "name", alias: "name", args: [] },
        { fn: "raw", column: "model", alias: "model", args: [] },
        { fn: "raw", column: "total_cost", alias: "total_cost", args: [] },
        { fn: "raw", column: "duration", alias: "duration", args: [] },
        { fn: "raw", column: "trace_id", alias: "trace_id", args: [], hidden: true },
        { fn: "raw", column: "span_id", alias: "span_id", args: [], hidden: true },
      ],
      dimensions: [],
      filters: [],
      orderBy: [{ field: "total_cost", dir: "desc" }],
    },
    config: { type: "table" },
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
ORDER BY duration DESC`,
    queryStructure: {
      table: "spans",
      metrics: [
        { fn: "raw", column: "name", alias: "name", args: [] },
        { fn: "raw", column: "model", alias: "model", args: [] },
        { fn: "raw", column: "duration", alias: "duration", args: [] },
        { fn: "raw", column: "total_cost", alias: "total_cost", args: [] },
        { fn: "raw", column: "trace_id", alias: "trace_id", args: [], hidden: true },
        { fn: "raw", column: "span_id", alias: "span_id", args: [], hidden: true },
      ],
      dimensions: [],
      filters: [],
      orderBy: [{ field: "duration", dir: "desc" }],
    },
    config: { type: "table" },
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
    queryStructure: {
      table: "signal_events",
      metrics: [{ fn: "count", column: "*", alias: "count", args: [] }],
      dimensions: ["name"],
      filters: [],
      orderBy: [{ field: "count", dir: "desc" }],
      limit: 10,
    },
    config: { x: "count", y: "name", type: "horizontalBar", displayMode: "total" },
  },
  {
    name: "Signal events table",
    table: "signals",
    query: `SELECT
    name,
    severity,
    timestamp,
    signal_id,
    trace_id
FROM signal_events
WHERE
    timestamp >= {start_time:DateTime64}
    AND timestamp <= {end_time:DateTime64}
ORDER BY timestamp DESC`,
    queryStructure: {
      table: "signal_events",
      metrics: [
        { fn: "raw", column: "name", alias: "name", args: [] },
        { fn: "raw", column: "severity", alias: "severity", args: [] },
        { fn: "raw", column: "timestamp", alias: "timestamp", args: [] },
        { fn: "raw", column: "signal_id", alias: "signal_id", args: [], hidden: true },
        { fn: "raw", column: "trace_id", alias: "trace_id", args: [], hidden: true },
      ],
      dimensions: [],
      filters: [],
      orderBy: [{ field: "timestamp", dir: "desc" }],
    },
    config: { type: "table" },
  },
];
