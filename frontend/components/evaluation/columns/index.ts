import { type ColumnDef, type RowData } from "@tanstack/react-table";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";
import { type EvalRow } from "@/lib/evaluation/types";

import { ComparisonCostCell } from "./comparison-cost-cell";
import { ComparisonDurationCell } from "./comparison-duration-cell";
import { createComparisonScoreColumnCell } from "./comparison-score-cell";
import { CostCell } from "./cost-cell";
import { DurationCell } from "./duration-cell";
import { createScoreColumnCell } from "./score-cell";
import { StatusCell } from "./status-cell";

// -- tanstack module augmentation --
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    sql?: string;
    dataType?: "string" | "number" | "json" | "datetime";
    filterable?: boolean;
    comparable?: boolean;
    dbType?: string;
    filterSql?: string;
    scoreName?: string;
  }
}

// -- Static column definitions --

export const STATIC_COLUMNS: ColumnDef<EvalRow>[] = [
  {
    id: "id",
    accessorFn: (row) => row["id"],
    header: "ID",
    enableSorting: false,
    meta: { sql: "dp.id", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "evaluationId",
    accessorFn: (row) => row["evaluationId"],
    header: "Evaluation ID",
    enableSorting: false,
    meta: { sql: "dp.evaluation_id", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "status",
    accessorFn: (row) => row["status"],
    cell: StatusCell,
    header: "Status",
    size: 70,
    enableSorting: false,
    meta: { sql: "t.status", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "index",
    accessorFn: (row) => row["index"],
    header: "Index",
    size: 70,
    enableSorting: true,
    meta: { sql: "dp.index", dataType: "number", filterable: true, comparable: false, dbType: "Int64" },
  },
  {
    id: "data",
    accessorFn: (row) => row["data"],
    header: "Data",
    enableSorting: false,
    meta: { sql: "substring(dp.data, 1, 200)", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "target",
    accessorFn: (row) => row["target"],
    header: "Target",
    enableSorting: false,
    meta: { sql: "substring(dp.target, 1, 200)", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "metadata",
    accessorFn: (row) => row["metadata"],
    header: "Metadata",
    enableSorting: false,
    meta: {
      sql: "dp.metadata",
      dataType: "json",
      filterable: true,
      comparable: false,
      filterSql:
        "(simpleJSONExtractString(dp.metadata, {KEY:String}) = {VAL:String} OR simpleJSONExtractRaw(dp.metadata, {KEY:String}) = {VAL:String})",
    },
  },
  {
    id: "output",
    accessorFn: (row) => row["output"],
    header: "Output",
    enableSorting: false,
    meta: { sql: "substring(dp.executor_output, 1, 200)", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "duration",
    accessorFn: (row) => row["duration"],
    cell: DurationCell,
    header: "Duration",
    enableSorting: true,
    meta: {
      sql: "(toUnixTimestamp64Milli(t.end_time) - toUnixTimestamp64Milli(t.start_time))",
      dataType: "number",
      filterable: true,
      comparable: true,
    },
  },
  {
    id: "cost",
    accessorFn: (row) => row["cost"],
    cell: CostCell,
    header: "Cost",
    enableSorting: true,
    meta: {
      sql: "if(t.total_cost > 0, greatest(t.input_cost + t.output_cost, t.total_cost), t.input_cost + t.output_cost)",
      dataType: "number",
      filterable: true,
      comparable: true,
    },
  },
  // Hidden columns - needed for row interactions and comparison data
  {
    id: "traceId",
    accessorFn: (row) => row["traceId"],
    header: "Trace ID",
    enableSorting: false,
    meta: { sql: "dp.trace_id", dataType: "string", filterable: true, comparable: true, dbType: "UUID" },
  },
  {
    id: "startTime",
    accessorFn: (row) => row["startTime"],
    header: "Start Time",
    enableSorting: false,
    meta: {
      sql: "formatDateTime(t.start_time, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: true,
    },
  },
  {
    id: "endTime",
    accessorFn: (row) => row["endTime"],
    header: "End Time",
    enableSorting: false,
    meta: {
      sql: "formatDateTime(t.end_time, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: true,
    },
  },
  {
    id: "inputCost",
    accessorFn: (row) => row["inputCost"],
    header: "Input Cost",
    enableSorting: false,
    meta: { sql: "t.input_cost", dataType: "number", filterable: false, comparable: true },
  },
  {
    id: "outputCost",
    accessorFn: (row) => row["outputCost"],
    header: "Output Cost",
    enableSorting: false,
    meta: { sql: "t.output_cost", dataType: "number", filterable: false, comparable: true },
  },
  {
    id: "totalCost",
    accessorFn: (row) => row["totalCost"],
    header: "Total Cost",
    enableSorting: false,
    meta: { sql: "t.total_cost", dataType: "number", filterable: false, comparable: true },
  },
  {
    id: "scores",
    accessorFn: (row) => row["scores"],
    header: "Scores",
    enableSorting: false,
    meta: { sql: "dp.scores", dataType: "string", filterable: false, comparable: true },
  },
  {
    id: "createdAt",
    accessorFn: (row) => row["createdAt"],
    header: "Created At",
    enableSorting: true,
    meta: {
      sql: "formatDateTime(dp.created_at, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: false,
    },
  },
];

// -- Score column factory --

const createColumnSizeConfig = (heatmapEnabled: boolean, isComparison: boolean = false) => ({
  size: heatmapEnabled ? (isComparison ? 140 : 100) : undefined,
  minSize: heatmapEnabled ? (isComparison ? 140 : 100) : isComparison ? 80 : 60,
});

export function createScoreColumnDef(
  name: string,
  heatmapEnabled: boolean = false,
  scoreRanges: ScoreRanges = {}
): ColumnDef<EvalRow> {
  return {
    id: `score:${name}`,
    header: name,
    accessorFn: (row) => row[`score:${name}`] ?? null,
    ...createColumnSizeConfig(heatmapEnabled, false),
    cell: createScoreColumnCell(heatmapEnabled, scoreRanges, name),
    enableSorting: true,
    meta: {
      sql: `JSONExtractFloat(dp.scores, '${name}')`,
      dataType: "number",
      filterable: true,
      comparable: true,
      scoreName: name,
    },
  };
}

export function createComparisonScoreColumnDef(
  name: string,
  heatmapEnabled: boolean = false,
  scoreRanges: ScoreRanges = {}
): ColumnDef<EvalRow> {
  return {
    id: `comparedScore:${name}`,
    header: name,
    accessorFn: (row) => row[`score:${name}`] ?? null,
    ...createColumnSizeConfig(heatmapEnabled, true),
    cell: createComparisonScoreColumnCell(heatmapEnabled, scoreRanges, name),
    enableSorting: true,
    meta: {
      sql: `JSONExtractFloat(dp.scores, '${name}')`,
      dataType: "number",
      filterable: true,
      comparable: true,
      scoreName: name,
    },
  };
}

// -- Comparison column overrides --
// When in comparison mode, duration and cost columns use comparison renderers

export const COMPARED_DURATION_COLUMN: ColumnDef<EvalRow> = {
  ...STATIC_COLUMNS.find((c) => c.id === "duration")!,
  cell: ComparisonDurationCell,
};

export const COMPARED_COST_COLUMN: ColumnDef<EvalRow> = {
  ...STATIC_COLUMNS.find((c) => c.id === "cost")!,
  cell: ComparisonCostCell,
};

// -- Helper functions --

/** IDs of columns that are visible by default in the table */
export const VISIBLE_COLUMN_IDS = ["status", "index", "data", "target", "metadata", "output", "duration", "cost"];

/** IDs of columns that are hidden (not shown in table but included in queries for data access) */
export const HIDDEN_COLUMN_IDS = [
  "id",
  "evaluationId",
  "traceId",
  "startTime",
  "endTime",
  "inputCost",
  "outputCost",
  "totalCost",
  "scores",
  "createdAt",
];

/** Get visible static columns for rendering */
export function getVisibleStaticColumns(): ColumnDef<EvalRow>[] {
  return STATIC_COLUMNS.filter((c) => VISIBLE_COLUMN_IDS.includes(c.id!));
}

// -- FE → BE payload builders --

/** Build the full columns payload for the BE query (SELECT + filter resolution) */
export function buildColumnsPayload(scores: string[]): EvalQueryColumn[] {
  const staticCols = STATIC_COLUMNS.filter((c) => c.meta?.sql).map((c) => ({
    id: c.id!,
    sql: c.meta!.sql!,
    comparable: c.meta!.comparable ?? false,
    ...(c.meta!.filterSql && { filterSql: c.meta!.filterSql }),
    ...(c.meta!.dbType && { dbType: c.meta!.dbType }),
  }));
  const scoreCols = scores.map((name) => ({
    id: `score:${name}`,
    sql: `JSONExtractFloat(dp.scores, '${name}')`,
    comparable: true,
    dbType: "Float64",
  }));
  return [...staticCols, ...scoreCols];
}

/** Build minimal columns for filter resolution (used by stats queries) */
export function buildFilterColumns(
  rawFilters: { column: string }[]
): EvalQueryColumn[] {
  const ids = [...new Set(rawFilters.map((f) => f.column))];
  return ids.map((id) => {
    if (id.startsWith("score:")) {
      const name = id.slice("score:".length);
      return { id, sql: `JSONExtractFloat(dp.scores, '${name}')`, dbType: "Float64" };
    }
    const col = STATIC_COLUMNS.find((c) => c.id === id);
    if (!col?.meta) throw new Error(`Unknown filter column: ${id}`);
    return {
      id: col.id!,
      sql: col.meta.sql!,
      ...(col.meta.filterSql && { filterSql: col.meta.filterSql }),
      ...(col.meta.dbType && { dbType: col.meta.dbType }),
    };
  });
}

/** Get the SQL expression for sorting a given column (self-sufficient — no allColumns param) */
export function getSortSql(sortBy: string): string | undefined {
  if (sortBy.startsWith("score:")) {
    return `JSONExtractFloat(dp.scores, '${sortBy.slice("score:".length)}')`;
  }
  return STATIC_COLUMNS.find((c) => c.id === sortBy)?.meta?.sql;
}
