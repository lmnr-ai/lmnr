import { ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";
import { Check, X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip.tsx";
import SpanTypeIcon, { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { Badge } from "@/components/ui/badge.tsx";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SpanType, TraceRow } from "@/lib/traces/types";
import { isStringDateOld } from "@/lib/traces/utils.ts";
import { normalizeClickHouseTimestamp, TIME_SECONDS_FORMAT } from "@/lib/utils";

const renderCost = (val: any) => {
  if (val == null) {
    return "-";
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? "-" : `$${parsed.toFixed(5)}`;
};

export const columns: ColumnDef<TraceRow, any>[] = [
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
          ) : isStringDateOld(normalizeClickHouseTimestamp(row.row.original.endTime)) ? (
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
        ) : isStringDateOld(normalizeClickHouseTimestamp(row.row.original.endTime)) ? (
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
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        return "-";
      }
      const duration = end.getTime() - start.getTime();
      return `${(duration / 1000).toFixed(2)}s`;
    },
    header: "Duration",
    id: "duration",
    size: 80,
  },
  {
    accessorFn: (row) => row.totalCost,
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
    accessorFn: (row) => row.totalTokens ?? "-",
    header: "Tokens",
    id: "totalTokens",
    cell: (row) => (
      <div className="truncate">
        {`${row.row.original.inputTokens ?? "-"}`}
        {" → "}
        {`${row.row.original.outputTokens ?? "-"}`}
        {` (${row.row.original.totalTokens ?? "-"})`}
      </div>
    ),
    size: 150,
  },
  {
    accessorFn: (row) => row.tags,
    cell: (row) => {
      const tags = row.getValue() as string[];

      if (tags?.length > 0) {
        return (
          <>
            {(row.getValue() as string[]).map((tag) => (
              <Badge key={tag} className="rounded-3xl mr-1" variant="outline">
                <span>{tag}</span>
              </Badge>
            ))}
          </>
        );
      }
      return "-";
    },
    header: "Tags",
    accessorKey: "tags",
    id: "tags",
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
            <TooltipContent
              side="bottom"
              className="p-2 border"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
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
    header: "Session ID",
    accessorKey: "sessionId",
    id: "session_id",
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
    name: "Session ID",
    key: "session_id",
    dataType: "string",
  },
  {
    name: "Duration",
    key: "duration",
    dataType: "number",
  },
  {
    name: "Top level span",
    key: "top_span_type",
    dataType: "enum",
    options: Object.values(SpanType).map((v) => ({
      label: v,
      value: v,
      icon: createSpanTypeIcon(v, "w-4 h-4", 14),
    })),
  },
  {
    name: "Top span name",
    key: "top_span_name",
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
    key: "total_cost",
    dataType: "number",
  },
  {
    name: "Input tokens",
    key: "input_tokens",
    dataType: "number",
  },
  {
    name: "Output tokens",
    key: "output_tokens",
    dataType: "number",
  },
  {
    name: "Total tokens",
    key: "total_tokens",
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
    name: "Tags",
    dataType: "string",
    key: "tags",
  },
  {
    name: "Metadata",
    key: "metadata",
    dataType: "json",
  },
  {
    name: "User ID",
    key: "user_id",
    dataType: "string",
  },
];
