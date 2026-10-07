import { type ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import TagsCell from "@/components/tags/tags-cell";
import { CostCell, DurationCell, TokensCell } from "@/components/traces/cells";
import SpanTypeIcon, { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { type SpanRow, SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

export const filters: ColumnFilter[] = [
  {
    key: "span_id",
    name: "ID",
    dataType: "string",
  },
  {
    key: "trace_id",
    name: "Trace ID",
    dataType: "string",
  },
  {
    name: "Type",
    dataType: "enum",
    key: "span_type",
    options: Object.values(SpanType).map((v) => ({
      label: v,
      value: v,
      icon: createSpanTypeIcon(v, "w-4 h-4", 14),
    })),
  },
  {
    key: "name",
    name: "Name",
    dataType: "string",
  },
  {
    key: "path",
    name: "Path",
    dataType: "string",
  },
  {
    key: "duration",
    name: "Duration",
    dataType: "number",
  },
  {
    key: "total_tokens",
    name: "Tokens",
    dataType: "number",
  },
  {
    key: "total_cost",
    name: "Cost",
    dataType: "number",
  },
  {
    name: "Status",
    dataType: "enum",
    key: "status",
    options: ["success", "error"].map((v) => ({
      label: capitalize(v),
      value: v,
    })),
  },
  {
    key: "tags",
    name: "Tags",
    dataType: "array",
  },
  {
    key: "model",
    name: "Model",
    dataType: "string",
  },
];

export const columns: ColumnDef<SpanRow, any>[] = [
  {
    cell: (row) => (
      <div
        className={cn("min-h-6 w-1.5 rounded-[2.5px] bg-success-bright", {
          "bg-destructive-bright": row.getValue() === "error",
          "": row.getValue() === "info", // temporary color values
          "bg-yellow-400": row.getValue() === "warning", // temporary color values
        })}
      />
    ),
    accessorKey: "status",
    header: () => <div />,
    id: "status",
    size: 40,
  },
  {
    cell: (row) => <Mono>{row.getValue()}</Mono>,
    header: "ID",
    accessorFn: (row) => row.spanId,
    id: "span_id",
  },
  {
    cell: (row) => <Mono>{row.getValue()}</Mono>,
    accessorKey: "traceId",
    header: "Trace ID",
    id: "trace_id",
  },
  {
    accessorKey: "spanType",
    header: "Span",
    id: "span",
    cell: (row) => (
      <div className="cursor-pointer flex gap-2 items-center">
        <SpanTypeIcon className="z-10" spanType={row.getValue()} />
        <div className="text-sm truncate">{row.row.original.name}</div>
      </div>
    ),
    size: 150,
  },
  {
    accessorKey: "path",
    header: "Path",
    id: "path",
    size: 150,
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 150,
  },
  {
    header: "Duration",
    id: "duration",
    cell: (row) => <DurationCell startTime={row.row.original.startTime} endTime={row.row.original.endTime} />,
    size: 100,
  },
  {
    accessorFn: (row) => row.totalTokens,
    header: "Tokens",
    id: "tokens",
    cell: (row) => <TokensCell stats={row.row.original} />,
    size: 160,
  },
  {
    accessorFn: (row) => row.totalCost,
    header: "Cost",
    id: "cost",
    cell: (row) => <CostCell stats={row.row.original} />,
    size: 100,
  },
  {
    header: "Model",
    accessorKey: "model",
    id: "model",
  },
  {
    accessorFn: (row) => row.tags,
    cell: (row) => {
      const tags = row.getValue() as string[];
      if (tags?.length > 0) return <TagsCell tags={tags} />;
      return "-";
    },
    header: "Tags",
    accessorKey: "tags",
    id: "tags",
  },
];

export const defaultSpansColumnOrder = [
  "status",
  "span_id",
  "trace_id",
  "span",
  "path",
  "start_time",
  "duration",
  "cost",
  "tokens",
  "model",
  "tags",
];
