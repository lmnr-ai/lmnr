import { type ChartConfig, ChartType } from "@/components/chart-builder/types";
import { TABLE_PAGE_SIZE } from "@/components/dashboards/editor/constants";
import { getTimeColumn } from "@/components/dashboards/editor/table-schemas";
import { type Filter, type Metric, type QueryStructure, type TimeRange } from "@/lib/actions/sql/types";

// ID columns auto-injected for Table and HorizontalBar charts so individual
// rows remain clickable in the dashboard (wired up by handleBarClick in chart.tsx
// and table-chart.tsx). Backend-agnostic: we just mark the metric hidden and
// render-time consumers filter on that flag.
const ID_COLUMNS_BY_TABLE: Record<string, string[]> = {
  spans: ["trace_id", "span_id"],
  traces: ["id"],
  signal_events: ["signal_id", "trace_id"],
};

export const needsTimeSeries = (chartType?: ChartType): boolean =>
  chartType === ChartType.LineChart || chartType === ChartType.BarChart;

// Raw-column SQL (agent- or hand-written) reverse-parses with no dimension, so the builder's
// "first metric vs first dimension" guess picks the wrong columns. Saved axes win while the form
// still selects both of them.
export const savedHorizontalBarAxes = (
  config: ChartConfig,
  metrics: Partial<Pick<Metric, "alias" | "column">>[],
  dimensions: (string | undefined)[] | undefined
): { x: string; y: string } | null => {
  const { x, y } = config;
  if (config.type !== ChartType.HorizontalBarChart || !x || !y || x === y) return null;

  const metricNames = new Set(metrics.map((m) => m.alias || m.column));
  return metricNames.has(x) && (metricNames.has(y) || !!dimensions?.includes(y)) ? { x, y } : null;
};

// Default timeRange for time-series charts — matches the shape the chart
// engine expects at execute time.
export const getDefaultTimeRange = (table: string): TimeRange => {
  const timeColumn = getTimeColumn(table);
  return {
    column: timeColumn,
    from: "{start_time:DateTime64}",
    to: "{end_time:DateTime64}",
    fillGaps: true,
    intervalValue: "1",
    intervalUnit: "{interval_unit:String}",
  };
};

// Adds trace_id/span_id/etc. as hidden `raw` metrics for Table and HorizontalBar
// charts so individual rows remain clickable. Skipped when the query has any
// aggregate metric (would need matching GROUP BY columns — ClickHouse would
// reject the query with NOT_AN_AGGREGATE).
export const injectIdMetrics = (
  metrics: QueryStructure["metrics"],
  dimensions: string[] | undefined,
  table: string | undefined,
  chartType: ChartType | undefined
): QueryStructure["metrics"] => {
  const isTable = chartType === ChartType.Table;
  const isHorizontalBar = chartType === ChartType.HorizontalBarChart;
  const hasAggregate = metrics.some((m) => m.fn !== "raw");
  if (!(isTable || isHorizontalBar) || hasAggregate || !table) return metrics;

  const existing = new Set<string | null | undefined>([
    ...metrics.map((m) => m.column),
    ...metrics.map((m) => m.alias),
    ...(dimensions || []),
  ]);
  const injected = [...metrics];
  for (const col of ID_COLUMNS_BY_TABLE[table] ?? []) {
    if (!existing.has(col)) {
      injected.push({ fn: "raw", column: col, alias: col, args: [], hidden: true });
    }
  }
  return injected;
};

// Default blank form state for a new chart (unconvertible saved SQL uses the freeform editor).
export const getDefaultFormValues = (): QueryStructure => ({
  table: "spans",
  metrics: [{ fn: "count", column: "*", alias: "count", args: [] }],
  dimensions: [],
  filters: [],
  orderBy: [],
  limit: undefined,
  timeRange: undefined,
});

const isTimeBound = (filter: Filter): boolean =>
  "stringValue" in filter && /^\{(start_time|end_time):DateTime64\}$/.test(filter.stringValue);

// Form state for a saved or reverse-parsed structure.
export const toFormValues = (structure: QueryStructure, chartType: ChartType | undefined): QueryStructure => {
  // Strip the dashboard's own time bounds. The editor re-appends them at execute time for
  // Table/HorizontalBar charts (see Form.tsx), and SQL reverse-parsed by convertSqlToJson still
  // carries them, so keeping them would duplicate. A user's own filter on that column stays.
  const timeColumn = getTimeColumn(structure.table);
  return {
    table: structure.table,
    metrics: structure.metrics,
    dimensions: structure.dimensions,
    filters: (structure.filters || []).filter((filter) => !(filter.field === timeColumn && isTimeBound(filter))),
    timeRange: structure.timeRange,
    orderBy: structure.orderBy,
    // Table charts never carry a LIMIT — pagination is applied at fetch time in the executor.
    limit: chartType === ChartType.Table ? undefined : structure.limit,
  };
};

// Maps old form state → new form state when the user switches chart type.
// Encodes the per-type invariants in one place:
//   - Table rows are bare columns, no aggregation, no limit
//   - Non-Table charts need an aggregate metric by default
//   - Line/Bar order by timeRange, not explicit orderBy
export const transformFormForChartType = (
  current: QueryStructure,
  newType: ChartType,
  previousType: ChartType | undefined
): QueryStructure => {
  if (newType === previousType) return current;

  if (newType === ChartType.Table) {
    return {
      ...current,
      metrics: [{ fn: "raw", column: "", alias: "", args: [] }],
      dimensions: [],
      orderBy: [],
      limit: undefined,
    };
  }

  if (previousType === ChartType.Table) {
    return {
      ...current,
      metrics: [{ fn: "count", column: "*", alias: "count", args: [] }],
      orderBy: [],
    };
  }

  if (newType === ChartType.LineChart || newType === ChartType.BarChart) {
    return { ...current, orderBy: [] };
  }

  return current;
};

// Charts without a saved queryStructure (legacy or freeform SQL) can use the visual
// editor only when the backend can convert their SQL to its QueryStructure shape.
export const convertSqlToJson = async (projectId: string, sql: string): Promise<QueryStructure> => {
  const response = await fetch(`/api/projects/${projectId}/sql/to-json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to convert SQL to JSON");
  }

  return JSON.parse(data.jsonStructure);
};

/**
 * One table page plus a probe row for `hasMore`. Wrapped in a subquery because freeform SQL can
 * end in its own LIMIT, and ClickHouse rejects a second top-level one. The newline keeps a trailing
 * `--` comment from swallowing the closing paren.
 */
export const paginateQuery = (query: string, page: number): string =>
  `SELECT * FROM (${query.trim().replace(/;+$/, "")}\n) LIMIT ${TABLE_PAGE_SIZE + 1} OFFSET ${page * TABLE_PAGE_SIZE}`;
