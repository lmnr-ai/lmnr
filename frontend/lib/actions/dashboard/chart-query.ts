import { z } from "zod/v4";

import { executeQuery, type SqlActor } from "@/lib/actions/sql";

import { DashboardError } from "./errors";
import { LayoutSchema } from "./layout";
import { type ChartUpsert } from "./upsert-charts";

/**
 * Raw-SQL chart writes from the CLI and the Laminar agent (both via app-server): each query is
 * checked against the parameters a dashboard binds and test-run before anything is saved. Charts
 * carry no `queryStructure`, like a SQL-editor export.
 */

export const MAX_CHARTS_PER_CALL = 30;

/** What a dashboard binds when it renders a chart (`components/dashboards/chart.tsx` → `convertToTimeParameters`). */
const DASHBOARD_PARAMS: Record<string, string> = {
  start_time: "DateTime64",
  end_time: "DateTime64",
  interval_unit: "String",
};

const PARAM_RE = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^{}]*?)\s*\}/g;

/** The subset of the frontend's `ChartConfig` a raw-SQL chart sets. */
export const RawChartConfigSchema = z.object({
  type: z.enum(["line", "bar", "horizontalBar", "table"]),
  x: z.string().nullish(),
  y: z.string().nullish(),
  breakdown: z.string().nullish(),
  displayMode: z.enum(["total", "average", "none"]).nullish(),
});

export type RawChartConfig = z.infer<typeof RawChartConfigSchema>;

/**
 * One chart to create (no `id`: name, query and config required) or patch (`id`: omitted fields
 * are kept). `query` and `config` travel together so the pair is always re-checked.
 */
export const ChartInputSchema = z.object({
  id: z.guid().nullish(),
  name: z.string().nullish(),
  query: z.string().nullish(),
  config: RawChartConfigSchema.nullish(),
  layout: LayoutSchema.nullish(),
});

export type ChartInput = z.infer<typeof ChartInputSchema>;

type Row = Record<string, unknown>;
export type RunQuery = (query: string, parameters: Record<string, string>) => Promise<Row[]>;

/** Test runs read as `actor`, so a chart can't be checked against rows its author can't read. */
export const queryRunner =
  (projectId: string, actor: SqlActor): RunQuery =>
  (query, parameters) =>
    executeQuery<Row>({ projectId, query, parameters }, { actor });

/** Checks every entry (test-running queries in parallel); any failure rejects the batch. */
export const checkCharts = async (
  charts: ChartInput[],
  runQuery: RunQuery
): Promise<{ upserts: ChartUpsert[]; warnings: string[] }> => {
  if (charts.length > MAX_CHARTS_PER_CALL) {
    throw DashboardError.validation(`At most ${MAX_CHARTS_PER_CALL} charts per call`);
  }
  const checked = await Promise.all(charts.map((chart, i) => checkChart(i, chart, runQuery)));
  return {
    upserts: checked.map((c) => c.upsert),
    warnings: checked.flatMap((c) => (c.warning ? [c.warning] : [])),
  };
};

/** Name/layout-only updates pass through; a changed query is checked and test-run. */
const checkChart = async (index: number, chart: ChartInput, runQuery: RunQuery) => {
  const prefix = (msg: string) => `charts[${index}]: ${msg}`;
  const { query, config, ...rest } = chart;
  if ((query == null) !== (config == null)) {
    throw DashboardError.validation(prefix("query and config must be given together"));
  }
  if (query == null || config == null) return { upsert: rest as ChartUpsert, warning: undefined };

  const result = await checkChartQuery(query, config, runQuery);
  if ("error" in result) throw DashboardError.validation(prefix(result.error));
  return {
    upsert: { ...rest, query: result.query, config } as ChartUpsert,
    warning: result.warning ? prefix(result.warning) : undefined,
  };
};

/** The query as it will be stored, and a warning when the mappings could not be checked. */
const checkChartQuery = async (
  rawQuery: string,
  config: RawChartConfig,
  runQuery: RunQuery
): Promise<{ query: string; warning?: string } | { error: string }> => {
  const query = rawQuery.trim().replace(/;+$/, "").trimEnd();
  const error = checkAxes(config) ?? checkParameters(query, config);
  if (error) return { error };

  let rows: Row[];
  try {
    rows = await runQuery(config.type === "table" ? firstTablePage(query) : query, testParameters(new Date()));
  } catch (e) {
    return { error: `query failed when run over the last 24h: ${sqlErrorMessage(e)}` };
  }

  const first = rows[0];
  if (!first || typeof first !== "object") {
    return {
      query,
      warning: "the query returned no rows over the last 24h, so x/y/breakdown were not checked against its columns",
    };
  }
  const mappingError = checkMappings(config, new Set(Object.keys(first))) ?? checkBreakdown(config, rows);
  return mappingError ? { error: mappingError } : { query };
};

/** `executeQuery` throws the app-server body, `{"error": "..."}`. */
const sqlErrorMessage = (e: unknown) => {
  const text = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON: use the text as is.
  }
  return text;
};

/** The first page a dashboard fetches for a table chart. */
export const firstTablePage = (query: string) => `SELECT * FROM (${query}\n) LIMIT 51 OFFSET 0`;

/**
 * Only the dashboard's own parameters, with the types it binds; both time bounds are required.
 * Line/bar charts plotted over `time` must bucket by the dashboard's interval.
 */
export const checkParameters = (query: string, config: RawChartConfig): string | undefined => {
  const used = new Set<string>();
  for (const [, name, type] of query.matchAll(PARAM_RE)) {
    const expected = DASHBOARD_PARAMS[name];
    if (expected === undefined) {
      return `unknown parameter \`{${name}:${type}}\`; a dashboard only binds {start_time:DateTime64}, {end_time:DateTime64} and {interval_unit:String}`;
    }
    if (expected !== type) return `parameter \`{${name}:${type}}\` must be written \`{${name}:${expected}}\``;
    used.add(name);
  }

  if (!used.has("start_time") || !used.has("end_time")) {
    return "the query must filter its time column with `{start_time:DateTime64}` and `{end_time:DateTime64}` so the chart follows the dashboard's time picker";
  }
  const overTime = (config.type === "line" || config.type === "bar") && config.x === "time";
  if (overTime && !used.has("interval_unit")) {
    return "a line/bar chart over `time` must bucket with `toStartOfInterval(<time column>, toInterval(1, {interval_unit:String}))` so it follows the dashboard's interval";
  }
};

/** Values in the exact shape `convertToTimeParameters` sends: UTC `YYYY-MM-DD HH:MM:SS.mmm`. */
export const testParameters = (now: Date): Record<string, string> => {
  const format = (t: Date) => t.toISOString().replace("T", " ").replace("Z", "");
  return {
    start_time: format(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    end_time: format(now),
    interval_unit: "HOUR",
  };
};

export const checkMappings = (config: RawChartConfig, columns: Set<string>): string | undefined => {
  for (const field of ["x", "y", "breakdown"] as const) {
    const column = config[field];
    if (column != null && !columns.has(column)) {
      return `\`config.${field}\` is \`${column}\`, but the query returns only: ${[...columns].sort().join(", ")}`;
    }
  }
};

/** Checked before the test run, so an empty 24h window can't let a chart through without axes. */
export const checkAxes = (config: RawChartConfig): string | undefined => {
  if (config.type !== "table" && (config.x == null || config.y == null)) {
    return "`config.x` and `config.y` are required for line, bar and horizontalBar charts";
  }
};

/**
 * Line/bar rows that repeat an x value come from a query that also groups by another column.
 * Without a breakdown the chart draws them as one series zig-zagging between the groups.
 */
export const checkBreakdown = (config: RawChartConfig, rows: Row[]): string | undefined => {
  const { type, breakdown, x, y } = config;
  if ((type !== "line" && type !== "bar") || breakdown != null || x == null) return;

  const seen = new Set<string>();
  const repeatsX = rows.some((row) => {
    if (!(x in row)) return false;
    const key = JSON.stringify(row[x]);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (!repeatsX) return;

  const candidates = Object.entries(rows[0] ?? {})
    .filter(([name, value]) => name !== x && name !== y && typeof value === "string")
    .map(([name]) => name)
    .join(", ");
  return `several rows share the same \`${x}\` value, so the query also groups by another column. Set \`config.breakdown\` to that column to draw one series per value (candidates: ${candidates}), or remove it from GROUP BY`;
};
