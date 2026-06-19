import { ChartType } from "@/components/chart-builder/types";
import { getTimeColumn } from "@/components/dashboards/editor/table-schemas";
import { type QueryStructure, type TimeRange } from "@/lib/actions/sql/types";

// ID columns auto-injected for Table and HorizontalBar charts so individual
// rows remain clickable in the dashboard (wired up by handleBarClick in chart.tsx
// and table-chart.tsx). Backend-agnostic: we just mark the metric hidden and
// render-time consumers filter on that flag.
export const ID_COLUMNS_BY_TABLE: Record<string, string[]> = {
  spans: ["trace_id", "span_id"],
  traces: ["id"],
  signal_events: ["signal_id", "trace_id"],
};

export const needsTimeSeries = (chartType?: ChartType): boolean =>
  chartType === ChartType.LineChart || chartType === ChartType.BarChart;

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

// Default blank form state for a new chart, or fallback after load errors.
export const getDefaultFormValues = (): QueryStructure => ({
  table: "spans",
  metrics: [{ fn: "count", column: "*", alias: "count", args: [] }],
  dimensions: [],
  filters: [],
  orderBy: [],
  limit: undefined,
  timeRange: undefined,
});

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

// Reverse-parses stored SQL into the QueryStructure shape via the backend
// `/sql/to-json` endpoint. Only used as a legacy fallback when opening charts
// saved before queryStructure was persisted on `settings`. Remove once a
// data-migration backfills queryStructure for every dashboard_charts row.
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
