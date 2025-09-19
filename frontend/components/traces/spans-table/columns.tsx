import { ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";
import { Check, X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon, { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SpanRow, SpanType } from "@/lib/traces/types";
import { normalizeClickHouseTimestamp, TIME_SECONDS_FORMAT } from "@/lib/utils";

const format = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 5,
  minimumFractionDigits: 1,
});

const detailedFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 8,
});

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
    dataType: "string",
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
      <div className="flex h-full justify-center items-center w-10">
        {row.getValue() === "error" ? (
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
    cell: (row) => (
      <ClientTimestampFormatter
        timestamp={String(normalizeClickHouseTimestamp(row.getValue()))}
        format={TIME_SECONDS_FORMAT}
      />
    ),
    id: "start_time",
    size: 150,
  },
  {
    accessorFn: (row) => {
      const start = new Date(row.startTime);
      const end = new Date(row.endTime);
      const duration = end.getTime() - start.getTime();

      return `${(duration / 1000).toFixed(2)}s`;
    },
    header: "Duration",
    id: "duration",
    size: 80,
  },
  {
    accessorFn: (row) => row.totalTokens,
    header: "Tokens",
    id: "tokens",
    cell: (row) => {
      if (row.getValue()) {
        return (
          <div className="truncate">
            {`${row.row.original.inputTokens ?? "-"}`}
            {" → "}
            {`${row.row.original.outputTokens ?? "-"}`}
            {` (${row.getValue() ?? "-"})`}
          </div>
        );
      }
      return <div className="flex items-center">-</div>;
    },
    size: 150,
  },
  {
    accessorFn: (row) => row.totalCost,
    header: "Cost",
    id: "cost",
    cell: (row) => {
      if (row.getValue() > 0) {
        return (
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
                    <div className="text-ellipsis overflow-hidden whitespace-nowrap">
                      {format.format(row.getValue())}
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="p-2 border">
                <div>
                  <div className="flex justify-between space-x-2">
                    <span>Input cost</span>
                    <span>{detailedFormat.format(row.row.original.inputCost)}</span>
                  </div>
                  <div className="flex justify-between space-x-2">
                    <span>Output cost</span>
                    <span>{detailedFormat.format(row.row.original.outputCost)}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return "-";
    },
    size: 100,
  },
  {
    header: "Model",
    accessorKey: "model",
    id: "model",
  },
  {
    header: "Tags",
    accessorKey: "tags",
    id: "tags",
    cell: (row) => {
      try {
        const value = JSON.parse(row.getValue()) as string[];

        if (value?.length > 0) {
          return value.join(", ");
        }

        return "-";
      } catch (_) {
        return "-";
      }
    },
  },
];
