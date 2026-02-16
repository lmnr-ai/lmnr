import { type ColumnDef, type RowData } from "@tanstack/react-table";

import { type EvalRow } from "@/lib/evaluation/types";

import { CostCell } from "./cost-cell";
import { DataCell } from "./data-cell";
import { DurationCell } from "./duration-cell";
import { createScoreColumnCell } from "./score-cell";
import { StatusCell } from "./status-cell";

// -- tanstack module augmentation --
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    // The raw SQL/ClickHouse expression used in the SELECT clause and as the
    // default ORDER BY expression. Columns without `sql` are excluded from the
    // backend query payload entirely (see `toColumnsPayload` in store.ts).
    sql?: string;
    // Controls how filter values are parsed (number → parseFloat, json → key=value
    // extraction) and which filter UI variant `DataTableFilter` renders.
    dataType?: "string" | "number" | "json" | "datetime";
    // When true, the column appears in the filter dropdown (`DataTableFilter`).
    // Columns with `filterable: false` are omitted from the filter UI completely.
    filterable?: boolean;
    // When true, the column is included in the comparison LEFT JOIN so its value
    // is aliased as `compared:<id>` alongside the primary evaluation's data.
    comparable?: boolean;
    // The ClickHouse type used for parameterized filter bindings in WHERE clauses
    // (e.g. `{param:Int64}`). Defaults to "String" when omitted.
    dbType?: string;
    // An alternative SQL expression used only in WHERE clauses, overriding `sql`.
    // Exists because some columns need different expressions for selection vs
    // filtering (e.g. metadata uses substring for SELECT but JSON extraction for WHERE).
    filterSql?: string;
    // Identifies dynamically-created score columns by name. Used in `score-cell`
    // to look up the correct value (`row["score:<name>"]`) and its comparison
    // counterpart, and to resolve score ranges for heatmap coloring.
    scoreName?: string;
    // When true, the column is excluded from the rendered table (`selectVisibleColumns`)
    // but still sent to the backend — useful for columns like `traceId` or `createdAt`
    // that drive sorting/filtering/row interactions without being user-visible.
    hidden?: boolean;
    // Marks dynamically-created custom columns so components can identify them
    // from columnDefs without reaching into the separate `customColumns` array.
    isCustom?: boolean;
    // The untruncated SQL expression for columns whose SELECT uses substring().
    // Used by DataCell to fetch the full value on hover.
    fullSql?: string;
  }
}

// -- Static column definitions --

export const STATIC_COLUMNS: ColumnDef<EvalRow>[] = [
  {
    id: "id",
    accessorFn: (row) => row["id"],
    header: "ID",
    enableSorting: false,
    meta: { sql: "id", dataType: "string", filterable: false, comparable: false, hidden: true },
  },
  {
    id: "evaluationId",
    accessorFn: (row) => row["evaluationId"],
    header: "Evaluation ID",
    enableSorting: false,
    meta: { sql: "evaluation_id", dataType: "string", filterable: false, comparable: false, hidden: true },
  },
  {
    id: "status",
    accessorFn: (row) => row["status"],
    cell: StatusCell,
    header: "Status",
    size: 70,
    enableSorting: false,
    meta: { sql: "trace_status", dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "index",
    accessorFn: (row) => row["index"],
    header: "Index",
    size: 70,
    enableSorting: true,
    meta: { sql: "`index`", dataType: "number", filterable: true, comparable: false, dbType: "Int64" },
  },
  {
    id: "data",
    accessorFn: (row) => row["data"],
    cell: DataCell,
    header: "Data",
    enableSorting: false,
    meta: { sql: "substring(data, 1, 200)", dataType: "string", filterable: false, comparable: false, fullSql: "data" },
  },
  {
    id: "target",
    accessorFn: (row) => row["target"],
    cell: DataCell,
    header: "Target",
    enableSorting: false,
    meta: { sql: "substring(target, 1, 200)", dataType: "string", filterable: false, comparable: false, fullSql: "target" },
  },
  {
    id: "metadata",
    accessorFn: (row) => row["metadata"],
    cell: DataCell,
    header: "Metadata",
    enableSorting: false,
    meta: {
      sql: "metadata",
      dataType: "json",
      filterable: true,
      comparable: false,
      filterSql:
        "(simpleJSONExtractString(metadata, {KEY:String}) = {VAL:String} OR simpleJSONExtractRaw(metadata, {KEY:String}) = {VAL:String})",
    },
  },
  {
    id: "output",
    accessorFn: (row) => row["output"],
    cell: DataCell,
    header: "Output",
    enableSorting: false,
    meta: { sql: "substring(executor_output, 1, 200)", dataType: "string", filterable: false, comparable: false, fullSql: "executor_output" },
  },
  {
    id: "duration",
    accessorFn: (row) => row["duration"],
    cell: DurationCell,
    header: "Duration",
    enableSorting: true,
    meta: {
      sql: "duration",
      dataType: "number",
      filterable: true,
      comparable: true,
      dbType: "Float64",
    },
  },
  {
    id: "cost",
    accessorFn: (row) => row["cost"],
    cell: CostCell,
    header: "Cost",
    enableSorting: true,
    meta: {
      sql: "if(total_cost > 0, greatest(input_cost + output_cost, total_cost), input_cost + output_cost)",
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
    meta: { sql: "trace_id", dataType: "string", filterable: true, comparable: true, dbType: "UUID", hidden: true },
  },
  {
    id: "startTime",
    accessorFn: (row) => row["startTime"],
    header: "Start Time",
    enableSorting: false,
    meta: {
      sql: "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: true,
      hidden: true,
    },
  },
  {
    id: "endTime",
    accessorFn: (row) => row["endTime"],
    header: "End Time",
    enableSorting: false,
    meta: {
      sql: "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: true,
      hidden: true,
    },
  },
  {
    id: "inputCost",
    accessorFn: (row) => row["inputCost"],
    header: "Input Cost",
    enableSorting: false,
    meta: { sql: "input_cost", dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "outputCost",
    accessorFn: (row) => row["outputCost"],
    header: "Output Cost",
    enableSorting: false,
    meta: { sql: "output_cost", dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "totalCost",
    accessorFn: (row) => row["totalCost"],
    header: "Total Cost",
    enableSorting: false,
    meta: { sql: "total_cost", dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "scores",
    accessorFn: (row) => row["scores"],
    header: "Scores",
    enableSorting: false,
    meta: { sql: "scores", dataType: "string", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "createdAt",
    accessorFn: (row) => row["createdAt"],
    header: "Created At",
    enableSorting: true,
    meta: {
      sql: "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: false,
      hidden: true,
    },
  },
];

// -- Score column factory --

export function createScoreColumnDef(name: string): ColumnDef<EvalRow> {
  return {
    id: `score:${name}`,
    header: name,
    accessorFn: (row) => row[`score:${name}`] ?? null,
    minSize: 60,
    cell: createScoreColumnCell(name),
    enableSorting: true,
    meta: {
      sql: `simpleJSONExtractFloat(scores, '${name.replace(/'/g, "\\'")}')`,
      dataType: "number",
      filterable: true,
      comparable: true,
      scoreName: name,
    },
  };
}
