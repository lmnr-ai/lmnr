import { type ColumnDef } from "@tanstack/react-table";

import { deriveDatapointStatus } from "@/lib/evaluation/status";
import { type EvalRow } from "@/lib/evaluation/types";

import { CostCell } from "./cost-cell";
import { DataCell } from "./data-cell";
import { DurationCell } from "./duration-cell";
import { createScoreColumnCell, scoreDirectionDropdownItems } from "./score-cell";
import { StatusCell } from "./status-cell";

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
    accessorFn: (row) => deriveDatapointStatus(row),
    cell: StatusCell,
    header: "Status",
    size: 82,
    enableSorting: false,
    meta: {
      // SELECT stays the raw trace flag. Filter Success = scored and not error
      // (excludes running/stale); Error = trace_status error.
      sql: "trace_status",
      filterSql: `multiIf(trace_status = 'error', 'error', scores != '' AND scores != '{}', 'success', 'pending')`,
      dataType: "string",
      filterable: true,
      comparable: false,
      dbType: "String",
    },
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
    meta: {
      sql: "substring(data, 1, 200)",
      dataType: "string",
      filterable: false,
      comparable: false,
      fullSql: "data",
      truncated: true,
    },
  },
  {
    id: "target",
    accessorFn: (row) => row["target"],
    cell: DataCell,
    header: "Target",
    enableSorting: false,
    meta: {
      sql: "substring(target, 1, 200)",
      dataType: "string",
      filterable: false,
      comparable: false,
      fullSql: "target",
      truncated: true,
    },
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
    meta: {
      sql: "substring(executor_output, 1, 200)",
      dataType: "string",
      filterable: false,
      // Comparable so the datapoint-comparison view can show both runs' outputs
      // side by side. `data` / `target` stay non-comparable — they're the same
      // dataset row at a given index, so there is nothing to diff.
      comparable: true,
      fullSql: "executor_output",
      truncated: true,
    },
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
      dbType: "Float64",
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
    id: "inputTokens",
    accessorFn: (row) => row["inputTokens"],
    header: "Input Tokens",
    enableSorting: false,
    meta: { sql: "input_tokens", dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "outputTokens",
    accessorFn: (row) => row["outputTokens"],
    header: "Output Tokens",
    enableSorting: false,
    meta: { sql: "output_tokens", dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "totalTokens",
    accessorFn: (row) => row["totalTokens"],
    header: "Total Tokens",
    enableSorting: false,
    meta: { sql: "total_tokens", dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "cacheReadInputTokens",
    accessorFn: (row) => row["cacheReadInputTokens"],
    header: "Cache Input Tokens",
    enableSorting: false,
    meta: {
      sql: "cache_read_input_tokens",
      dataType: "number",
      filterable: false,
      comparable: true,
      hidden: true,
    },
  },
  {
    id: "reasoningTokens",
    accessorFn: (row) => row["reasoningTokens"],
    header: "Reasoning Tokens",
    enableSorting: false,
    meta: { sql: "reasoning_tokens", dataType: "number", filterable: false, comparable: true, hidden: true },
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
  {
    id: "updatedAt",
    accessorFn: (row) => row["updatedAt"],
    header: "Updated At",
    enableSorting: false,
    meta: {
      sql: "formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ')",
      dataType: "datetime",
      filterable: false,
      comparable: false,
      hidden: true,
    },
  },
  {
    id: "traceStatus",
    accessorFn: (row) => row["traceStatus"],
    header: "Trace Status",
    enableSorting: false,
    meta: { sql: "trace_status", dataType: "string", filterable: false, comparable: false, hidden: true },
  },
  {
    id: "topSpanId",
    accessorFn: (row) => row["topSpanId"],
    header: "Top Span ID",
    enableSorting: false,
    meta: { sql: "top_span_id", dataType: "string", filterable: false, comparable: false, hidden: true },
  },
];

/** NULL when the key is absent — `simpleJSONExtractFloat` alone returns 0. */
export const scoreColumnSql = (name: string): string => {
  const escaped = name.replace(/[\\']/g, "\\$&");
  return `if(JSONHas(scores, '${escaped}'), simpleJSONExtractFloat(scores, '${escaped}'), NULL)`;
};

export function createScoreColumnDef(name: string): ColumnDef<EvalRow> {
  return {
    id: `score:${name}`,
    header: name,
    accessorFn: (row) => row[`score:${name}`] ?? null,
    minSize: 60,
    cell: createScoreColumnCell(name),
    enableSorting: true,
    meta: {
      sql: scoreColumnSql(name),
      dataType: "number",
      filterable: true,
      comparable: true,
      scoreName: name,
      dbType: "Float64",
      customDropdownItems: (table) => scoreDirectionDropdownItems(name, table),
    },
  };
}
