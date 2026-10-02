import { type ChartConfig, ChartType } from "./types";

export interface ColumnInfo {
  name: string;
  type: "string" | "number" | "boolean";
}

export type DataRow = Record<string, string | number | boolean>;

export const transformDataToColumns = (data: DataRow[]): ColumnInfo[] => {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];
  return Object.keys(firstRow).map((key) => {
    const value = firstRow[key];
    let type: "string" | "number" | "boolean";

    if (typeof value === "number") {
      type = "number";
    } else if (typeof value === "boolean") {
      type = "boolean";
    } else {
      type = "string";
    }

    return {
      name: key,
      type,
    };
  });
};

export const canSelectForYAxis = (column: ColumnInfo, chartType: ChartType | undefined): boolean => {
  if (chartType === ChartType.HorizontalBarChart) {
    return true;
  }
  return column.type !== "string";
};

/** Horizontal bars read the other way round: x is the measured value, y the category. */
export const canSelectForXAxis = (column: ColumnInfo, chartType: ChartType | undefined): boolean =>
  chartType === ChartType.HorizontalBarChart ? column.type === "number" : true;

// Column names that read as a time bucket (`t`, `ts`, `day`, `start_time`, `hour_bucket`, …). Only
// used to prefer one dimension over another when picking default axes; a miss falls back to the
// first non-numeric column.
const TIME_LIKE_COLUMN = /(^|_)(t|ts|time|timestamp|date|day|hour|minute|min|week|month|bucket|period)(_|$)/i;

/**
 * The axes a result set most likely wants charted: the metric (first numeric column) against the
 * dimension (a time-looking column, else the first non-numeric one). Returns nothing when the data
 * has no such pair — one numeric column alone has nothing to plot against.
 */
export const pickDefaultAxes = (
  columns: ColumnInfo[],
  chartType: ChartType | undefined
): { x?: string; y?: string } => {
  const numeric = columns.filter((col) => col.type === "number");
  const dimensions = columns.filter((col) => col.type !== "number");

  const dimension = dimensions.find((col) => TIME_LIKE_COLUMN.test(col.name)) ?? dimensions[0];
  const metric = numeric.find((col) => col.name !== dimension?.name);

  if (!dimension || !metric) return {};

  return chartType === ChartType.HorizontalBarChart
    ? { x: metric.name, y: dimension.name }
    : { x: dimension.name, y: metric.name };
};

/**
 * Drop axis selections the current result set can't satisfy, then fill the gaps with defaults.
 *
 * The SQL editor persists a chart config per saved query, so editing the SELECT list (commenting one
 * aggregate out for another, say) leaves axes naming columns that no longer come back — which used
 * to render an empty chart pane with nothing pointing at the cause.
 */
export const reconcileChartConfig = (config: ChartConfig, columns: ColumnInfo[]): ChartConfig => {
  // No columns means there is no result set to reconcile against — keep the selections untouched
  // so an empty run doesn't wipe a working config.
  if (columns.length === 0 || config.type === ChartType.Table) return config;

  const column = (name?: string) => (name ? columns.find((col) => col.name === name) : undefined);
  const type = config.type ?? ChartType.LineChart;

  const xColumn = column(config.x);
  const yColumn = column(config.y);
  const defaults = pickDefaultAxes(columns, type);

  const x = xColumn && canSelectForXAxis(xColumn, type) ? config.x : defaults.x;
  const y = yColumn && canSelectForYAxis(yColumn, type) ? config.y : defaults.y;
  const breakdown =
    column(config.breakdown) && config.breakdown !== x && config.breakdown !== y ? config.breakdown : undefined;

  return { ...config, type, x, y, breakdown };
};

export const isValidChartConfiguration = (config: ChartConfig, columns: ColumnInfo[]): boolean => {
  const { type, x, y, breakdown } = config;

  if (!type || !x || !y) return false;

  const xColumn = columns.find((col) => col.name === x);
  const yColumn = columns.find((col) => col.name === y);

  if (!xColumn || !yColumn) return false;

  if (breakdown) {
    const breakdownColumn = columns.find((col) => col.name === breakdown);
    if (!breakdownColumn) return false;
  }

  return true;
};

export const getAvailableBreakdownColumns = (config: ChartConfig, columns: ColumnInfo[]): ColumnInfo[] => {
  const { x, y } = config;
  const usedColumns = new Set([x, y].filter(Boolean));
  return columns.filter((col) => !usedColumns.has(col.name));
};
