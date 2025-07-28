import { ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";
import { Check, X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon, { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Span, SpanType } from "@/lib/traces/types";

const renderCost = (val: any) => {
  if (val === null || val === undefined) {
    return "-";
  }
  const parsed = parseFloat(val);
  return `$${Number.isNaN(parsed) ? val : parsed.toFixed(5)}`;
};

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
    key: "latency",
    name: "Latency",
    dataType: "number",
  },
  {
    key: "tokens",
    name: "Tokens",
    dataType: "number",
  },
  {
    key: "cost",
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
    dataType: "string",
  },
  {
    key: "model",
    name: "Model",
    dataType: "string",
  },
];

export const columns: ColumnDef<Span, any>[] = [
  {
    cell: (row) => (
      <div className="flex h-full justify-center items-center w-10">
        {row.getValue() ? (
          <X className="self-center text-destructive" size={18} />
        ) : (
          <Check className="text-success" size={18} />
        )}
      </div>
    ),
    accessorKey: "status",
    header: "Status",
    id: "status",
    size: 70,
  },
  {
    cell: (row) => <Mono>{row.getValue()}</Mono>,
    header: "ID",
    accessorFn: (row) => row.spanId.replace(/^00000000-0000-0000-/g, ""),
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
    cell: (row) => row.getValue(),
    accessorKey: "inputPreview",
    header: "Input",
    id: "input",
    size: 150,
  },
  {
    cell: (row) => row.getValue(),
    accessorKey: "outputPreview",
    header: "Output",
    id: "output",
    size: 150,
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 125,
  },
  {
    accessorFn: (row) => {
      const start = new Date(row.startTime);
      const end = new Date(row.endTime);
      const duration = end.getTime() - start.getTime();

      return `${(duration / 1000).toFixed(2)}s`;
    },
    header: "Latency",
    id: "latency",
    size: 80,
  },
  {
    accessorFn: (row) => (row.attributes as Record<string, any>)["llm.usage.total_tokens"],
    header: "Tokens",
    id: "tokens",
    cell: (row) => {
      if (row.getValue()) {
        return (
          <div className="truncate">
            {`${row.row.original.attributes["gen_ai.usage.input_tokens"] ?? "-"}`}
            {" → "}
            {`${row.row.original.attributes["gen_ai.usage.output_tokens"] ?? "-"}`}
            {` (${row.getValue() ?? "-"})`}
          </div>
        );
      }
      return <div className="flex items-center">-</div>;
    },
    size: 150,
  },
  {
    accessorFn: (row) => (row.attributes as Record<string, any>)["gen_ai.usage.cost"],
    header: "Cost",
    id: "cost",
    cell: (row) => (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger className="relative p-0">
            <div
              style={{
                width: row.column.getSize() - 32,
              }}
              className="relative"
            >
              <div className="absolute inset-0 top-[-4px] items-center h-full flex">
                <div className="text-ellipsis overflow-hidden whitespace-nowrap">{renderCost(row.getValue())}</div>
              </div>
            </div>
          </TooltipTrigger>
          {row.getValue() !== undefined && (
            <TooltipContent side="bottom" className="p-2 border">
              <div>
                <div className="flex justify-between space-x-2">
                  <span>Input cost</span>
                  <span>{renderCost(row.row.original.attributes["gen_ai.usage.input_cost"])}</span>
                </div>
                <div className="flex justify-between space-x-2">
                  <span>Output cost</span>
                  <span>{renderCost(row.row.original.attributes["gen_ai.usage.output_cost"])}</span>
                </div>
              </div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    ),
    size: 100,
  },
  {
    header: "Model",
    accessorKey: "model",
    id: "model",
  },
];
