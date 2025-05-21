import { ColumnDef } from "@tanstack/react-table";
import { ArrowRight } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { ColumnFilter } from "@/components/ui/datatable-filter";
import Mono from "@/components/ui/mono";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Span } from "@/lib/traces/types";

const renderCost = (val: any) => {
  if (val == null) {
    return "-";
  }
  return `$${parseFloat(val).toFixed(5) || val}`;
};

export const filters: ColumnFilter[] = [
  {
    key: "id",
    name: "ID",
    dataType: "string",
  },
  {
    key: "trace_id",
    name: "Trace ID",
    dataType: "string",
  },
  {
    key: "span_type",
    name: "Type",
    dataType: "string",
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
    key: "labels",
    name: "Labels",
    dataType: "json",
  },
  {
    key: "model",
    name: "Model",
    dataType: "string",
  },
];

export const columns: ColumnDef<Span, any>[] = [
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
    header: "Type",
    id: "span_type",
    cell: (row) => (
      <div className="cursor-pointer flex space-x-2 items-center hover:underline">
        <SpanTypeIcon className="z-10" spanType={row.getValue()} />
        <div className="flex text-sm">{row.getValue() === "DEFAULT" ? "SPAN" : row.getValue()}</div>
      </div>
    ),
    size: 120,
  },
  {
    cell: (row) => <div className="cursor-pointer hover:underline">{row.getValue()}</div>,
    accessorKey: "name",
    header: "Name",
    id: "name",
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
          <div className="flex items-center">
            {`${row.row.original.attributes["gen_ai.usage.input_tokens"] ?? "-"}`}
            <ArrowRight size={12} className="mx-1 min-w-[12px]" />
            {`${row.row.original.attributes["gen_ai.usage.output_tokens"] ?? "-"}`}
            {` (${row.getValue() ?? "-"})`}
          </div>
        );
      }
      return <div className="flex items-center"></div>;
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
          {row.getValue() != undefined && (
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
