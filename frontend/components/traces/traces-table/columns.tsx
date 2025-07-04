import { ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trace } from "@/lib/traces/types";
import { isStringDateOld } from "@/lib/traces/utils";

const renderCost = (val: any) => {
  if (val == null) {
    return "-";
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? "-" : `$${parsed.toFixed(5)}`;
};

export const columns: ColumnDef<Trace, any>[] = [
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
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
    header: "ID",
    accessorKey: "id",
    id: "id",
  },
  {
    accessorKey: "topSpanType",
    header: "Top level span",
    id: "top_span_type",
    cell: (row) => (
      <div className="cursor-pointer flex gap-2 items-center">
        <div className="flex items-center gap-2">
          {row.row.original.topSpanName ? (
            <SpanTypeIcon className="z-10" spanType={row.getValue()} />
          ) : isStringDateOld(row.row.original.endTime) ? (
            <NoSpanTooltip>
              <div className="flex items-center gap-2 rounded-sm bg-secondary p-1">
                <X className="w-4 h-4" />
              </div>
            </NoSpanTooltip>
          ) : (
            <Skeleton className="w-6 h-6 bg-secondary rounded-sm" />
          )}
        </div>
        {row.row.original.topSpanName ? (
          <div className="text-sm truncate">{row.row.original.topSpanName}</div>
        ) : isStringDateOld(row.row.original.endTime) ? (
          <NoSpanTooltip>
            <div className="flex text-muted-foreground">None</div>
          </NoSpanTooltip>
        ) : (
          <Skeleton className="w-14 h-4 text-secondary-foreground py-0.5 bg-secondary rounded-full text-sm" />
        )}
      </div>
    ),
    size: 150,
  },

  {
    cell: (row) => row.getValue(),
    accessorKey: "topSpanInputPreview",
    header: "Input",
    id: "input",
    size: 150,
  },
  {
    cell: (row) => row.getValue(),
    accessorKey: "topSpanOutputPreview",
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
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        return "-";
      }
      const duration = end.getTime() - start.getTime();
      return `${(duration / 1000).toFixed(2)}s`;
    },
    header: "Latency",
    id: "latency",
    size: 80,
  },
  {
    accessorFn: (row) => row.cost,
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
                  <span>{renderCost(row.row.original.inputCost)}</span>
                </div>
                <div className="flex justify-between space-x-2">
                  <span>Output cost</span>
                  <span>{renderCost(row.row.original.outputCost)}</span>
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
    accessorFn: (row) => row.totalTokenCount ?? "-",
    header: "Tokens",
    id: "total_token_count",
    cell: (row) => (
      <div className="truncate">
        {`${row.row.original.inputTokenCount ?? "-"}`}
        {" → "}
        {`${row.row.original.outputTokenCount ?? "-"}`}
        {` (${row.row.original.totalTokenCount ?? "-"})`}
      </div>
    ),
    size: 150,
  },
  {
    accessorFn: (row) => (row.metadata ? JSON.stringify(row.metadata, null, 2) : ""),
    header: "Metadata",
    id: "metadata",
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
                <div className="text-ellipsis overflow-hidden whitespace-nowrap">{row.getValue()}</div>
              </div>
            </div>
          </TooltipTrigger>
          {row.getValue() !== undefined && (
            <TooltipContent side="bottom" className="p-2 border">
              <div className="whitespace-pre-wrap">{row.getValue()}</div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    ),
    size: 100,
  },
  {
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
    header: "User ID",
    accessorKey: "userId",
    id: "user_id",
  },
];

export const filters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Latency",
    key: "latency",
    dataType: "number",
  },
  {
    name: "Top level span",
    key: "span_type",
    dataType: "json",
  },
  {
    name: "Top span name",
    key: "name",
    dataType: "string",
  },
  {
    name: "Input cost",
    key: "input_cost",
    dataType: "number",
  },
  {
    name: "Output cost",
    key: "output_cost",
    dataType: "number",
  },
  {
    name: "Total cost",
    key: "cost",
    dataType: "number",
  },
  {
    name: "Input tokens",
    key: "input_token_count",
    dataType: "number",
  },
  {
    name: "Output tokens",
    key: "output_token_count",
    dataType: "number",
  },
  {
    name: "Total tokens",
    key: "total_token_count",
    dataType: "number",
  },
  {
    name: "Metadata",
    key: "metadata",
    dataType: "json",
  },
  {
    name: "Tags",
    key: "tags",
    dataType: "string",
  },
  {
    name: "User ID",
    key: "user_id",
    dataType: "string",
  },
];
