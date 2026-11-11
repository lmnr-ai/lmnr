import { type ColumnDef } from "@tanstack/react-table";

import { deriveStatus } from "@/components/evaluation/utils";
import { EVAL_COLUMN_SQL, scoreColumnSql } from "@/lib/evaluation/columns";
import { type EvalRow } from "@/lib/evaluation/types";

import { CostCell } from "./cost-cell";
import { DataCell } from "./data-cell";
import { DurationCell } from "./duration-cell";
import { createScoreColumnCell, scoreDirectionDropdownItems } from "./score-cell";
import { StatusCell, StatusHeader } from "./status-cell";
import { TaskCell } from "./task-cell";

// -- Static column definitions --

export const STATIC_COLUMNS: ColumnDef<EvalRow>[] = [
  {
    id: "id",
    accessorFn: (row) => row["id"],
    header: "ID",
    enableSorting: false,
    meta: { ...EVAL_COLUMN_SQL.id, dataType: "string", filterable: false, comparable: false, hidden: true },
  },
  {
    id: "evaluationId",
    accessorFn: (row) => row["evaluationId"],
    header: "Evaluation ID",
    enableSorting: false,
    meta: { ...EVAL_COLUMN_SQL.evaluationId, dataType: "string", filterable: false, comparable: false, hidden: true },
  },
  {
    id: "status",
    accessorFn: (row) => deriveStatus(row),
    cell: StatusCell,
    header: StatusHeader,
    size: 110,
    enableSorting: false,
    meta: { dataType: "string", filterable: false, comparable: false },
  },
  {
    id: "taskId",
    accessorFn: (row) => row["taskId"],
    cell: TaskCell,
    header: "Task",
    size: 180,
    enableSorting: true,
    meta: { ...EVAL_COLUMN_SQL.taskId, dataType: "string", filterable: true, comparable: false },
  },
  {
    id: "index",
    accessorFn: (row) => row["index"],
    header: "Index",
    size: 70,
    enableSorting: true,
    meta: { ...EVAL_COLUMN_SQL.index, dataType: "number", filterable: true, comparable: false },
  },
  {
    id: "data",
    accessorFn: (row) => row["data"],
    cell: DataCell,
    header: "Data",
    enableSorting: false,
    meta: {
      ...EVAL_COLUMN_SQL.data,
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
      ...EVAL_COLUMN_SQL.target,
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
      ...EVAL_COLUMN_SQL.metadata,
      dataType: "json",
      filterable: true,
      comparable: false,
    },
  },
  {
    id: "output",
    accessorFn: (row) => row["output"],
    cell: DataCell,
    header: "Output",
    enableSorting: false,
    meta: {
      ...EVAL_COLUMN_SQL.output,
      dataType: "string",
      filterable: false,
      comparable: false,
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
      ...EVAL_COLUMN_SQL.duration,
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
      ...EVAL_COLUMN_SQL.cost,
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
    meta: { ...EVAL_COLUMN_SQL.traceId, dataType: "string", filterable: true, comparable: true, hidden: true },
  },
  {
    id: "startTime",
    accessorFn: (row) => row["startTime"],
    header: "Start Time",
    enableSorting: false,
    meta: {
      ...EVAL_COLUMN_SQL.startTime,
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
      ...EVAL_COLUMN_SQL.endTime,
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
    meta: { ...EVAL_COLUMN_SQL.inputCost, dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "outputCost",
    accessorFn: (row) => row["outputCost"],
    header: "Output Cost",
    enableSorting: false,
    meta: { ...EVAL_COLUMN_SQL.outputCost, dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "totalCost",
    accessorFn: (row) => row["totalCost"],
    header: "Total Cost",
    enableSorting: false,
    meta: { ...EVAL_COLUMN_SQL.totalCost, dataType: "number", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "scores",
    accessorFn: (row) => row["scores"],
    header: "Scores",
    enableSorting: false,
    meta: { ...EVAL_COLUMN_SQL.scores, dataType: "string", filterable: false, comparable: true, hidden: true },
  },
  {
    id: "createdAt",
    accessorFn: (row) => row["createdAt"],
    header: "Created At",
    enableSorting: true,
    meta: {
      ...EVAL_COLUMN_SQL.createdAt,
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
    meta: { ...EVAL_COLUMN_SQL.traceStatus, dataType: "string", filterable: false, comparable: false, hidden: true },
  },
  {
    id: "topSpanId",
    accessorFn: (row) => row["topSpanId"],
    header: "Top Span ID",
    enableSorting: false,
    meta: { ...EVAL_COLUMN_SQL.topSpanId, dataType: "string", filterable: false, comparable: false, hidden: true },
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
      ...scoreColumnSql(name),
      dataType: "number",
      filterable: true,
      comparable: true,
      scoreName: name,
      customDropdownItems: (table) => scoreDirectionDropdownItems(name, table),
    },
  };
}
