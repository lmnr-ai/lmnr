import { type ColumnDef, type RowData } from "@tanstack/react-table";

import { type ScoreRanges } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";

import { createComparisonScoreColumnCell } from "./comparison-score-cell";
import { ComparisonCostCell, CostCell } from "./cost-cell";
import { ComparisonDurationCell, DurationCell } from "./duration-cell";
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
  }
}

// -- Static column definitions --

export const STATIC_COLUMNS: ColumnDef<EvalRow>[] = [
  {
    id: "id",
    accessorFn: (row) => row["id"],
    header: "ID",
    enableSorting: false,
    meta: { sql: "a.id", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "evaluationId",
    accessorFn: (row) => row["evaluationId"],
    header: "Evaluation ID",
    enableSorting: false,
    meta: { sql: "a.evaluation_id", dataType: "string", filterable: false, comparable: false },
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
    meta: { sql: "a.index", dataType: "number", filterable: true, comparable: false },
  },
  {
    id: "data",
    accessorFn: (row) => row["data"],
    header: "Data",
    enableSorting: false,
    meta: { sql: "substring(a.data, 1, 200)", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "target",
    accessorFn: (row) => row["target"],
    header: "Target",
    enableSorting: false,
    meta: { sql: "substring(a.target, 1, 200)", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "metadata",
    accessorFn: (row) => row["metadata"],
    header: "Metadata",
    enableSorting: false,
    meta: { sql: "a.metadata", dataType: "json", filterable: true, comparable: false },
  },
  {
    id: "output",
    accessorFn: (row) => row["output"],
    header: "Output",
    enableSorting: false,
    meta: { sql: "substring(a.executor_output, 1, 200)", dataType: "string", filterable: false, comparable: false },
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
    meta: { sql: "a.trace_id", dataType: "string", filterable: true, comparable: true },
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
    meta: { sql: "a.scores", dataType: "string", filterable: false, comparable: true },
  },
  {
    id: "createdAt",
    accessorFn: (row) => row["createdAt"],
    header: "Created At",
    enableSorting: true,
    meta: {
      sql: "formatDateTime(a.created_at, '%Y-%m-%dT%H:%i:%S.%fZ')",
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
  scoreRanges: ScoreRanges = {},
): ColumnDef<EvalRow> {
  return {
    id: `score:${name}`,
    header: name,
    accessorFn: (row) => row[`score:${name}`] ?? null,
    ...createColumnSizeConfig(heatmapEnabled, false),
    cell: createScoreColumnCell(heatmapEnabled, scoreRanges, name),
    enableSorting: true,
    meta: {
      sql: `JSONExtractFloat(a.scores, '${name}')`,
      dataType: "number",
      filterable: true,
      comparable: true,
    },
  };
}

export function createComparisonScoreColumnDef(
  name: string,
  heatmapEnabled: boolean = false,
  scoreRanges: ScoreRanges = {},
): ColumnDef<EvalRow> {
  return {
    id: `comparedScore:${name}`,
    header: name,
    accessorFn: (row) => row[`score:${name}`] ?? null,
    ...createColumnSizeConfig(heatmapEnabled, true),
    cell: createComparisonScoreColumnCell(heatmapEnabled, scoreRanges, name),
    enableSorting: true,
    meta: {
      sql: `JSONExtractFloat(a.scores, '${name}')`,
      dataType: "number",
      filterable: true,
      comparable: true,
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
export const VISIBLE_COLUMN_IDS = [
  "status", "index", "data", "target", "metadata", "output", "duration", "cost",
];

/** IDs of columns that are hidden (not shown in table but included in queries for data access) */
export const HIDDEN_COLUMN_IDS = [
  "id", "evaluationId", "traceId", "startTime", "endTime",
  "inputCost", "outputCost", "totalCost", "scores", "createdAt",
];

/** Get visible static columns for rendering */
export function getVisibleStaticColumns(): ColumnDef<EvalRow>[] {
  return STATIC_COLUMNS.filter((c) => VISIBLE_COLUMN_IDS.includes(c.id!));
}

/** Get all filterable column filter definitions from the column config */
export function getFilterableColumns(scoreNames: string[]) {
  const filters = STATIC_COLUMNS
    .filter((c) => c.meta?.filterable)
    .map((c) => ({
      key: c.id!,
      name: typeof c.header === "string" ? c.header : c.id!,
      dataType: c.meta!.dataType === "json" ? ("json" as const) : c.meta!.dataType === "number" ? ("number" as const) : ("string" as const),
    }));

  const scoreFilters = scoreNames.map((name) => ({
    key: `score:${name}`,
    name,
    dataType: "number" as const,
  }));

  return [...filters, ...scoreFilters];
}

/** Extract { id, sql } pairs from column defs for the API request */
export function extractQueryColumns(columns: ColumnDef<EvalRow>[]): { id: string; sql: string }[] {
  return columns
    .filter((c) => c.meta?.sql)
    .map((c) => ({ id: c.id!, sql: c.meta!.sql! }));
}
