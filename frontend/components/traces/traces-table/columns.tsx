import { ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";
import { X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { NoSpanTooltip } from "@/components/traces/no-span-tooltip.tsx";
import SpanTypeIcon, { createSpanTypeIcon } from "@/components/traces/span-type-icon";
import { Badge } from "@/components/ui/badge.tsx";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import JsonTooltip from "@/components/ui/json-tooltip";
import Mono from "@/components/ui/mono";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SpanType, TraceRow } from "@/lib/traces/types";
import { isStringDateOld } from "@/lib/traces/utils.ts";
import { cn, TIME_SECONDS_FORMAT } from "@/lib/utils";

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

export const columns: ColumnDef<TraceRow, any>[] = [
  {
    cell: (row) => (
      <div
        className={cn("min-h-6 w-1.5 rounded-[2.5px] bg-success", {
          "bg-destructive": row.getValue() === "error",
          "": row.getValue() === "info", // temporary color values
          "bg-yellow-400": row.getValue() === "warning", // temporary color values
        })}
      />
    ),
    accessorFn: (row) => (row.status === "error" ? "error" : row.analysis_status),
    header: () => <div />,
    id: "status",
    size: 32,
  },
  // {
  //   cell: (row) => (
  //     <span
  //       title={row.row.original.summary}
  //       className={cn("text-sm line-clamp-1 whitespace-normal break-words", {
  //         "line-clamp-4": row.getValue() !== "",
  //       })}
  //     >
  //       {row.row.original.summary}
  //     </span>
  //   ),
  //   accessorFn: (row) => {
  //     if (row.analysis_preview !== "") {
  //       return row.analysis_preview;
  //     }
  //     return row.summary;
  //   },
  //   header: "Summary",
  //   id: "summary",
  //   size: 190,
  // },
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
    accessorFn: (row) => row.startTime,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
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
            {tags.map((tag) => (
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
    accessorFn: (row) => row.metadata,
    header: "Metadata",
    id: "metadata",
    cell: (row) => <JsonTooltip data={row.getValue()} columnSize={row.column.getSize()} />,
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
    name: "Analysis status",
    dataType: "enum",
    key: "analysis_status",
    options: ["info", "warning", "error"].map((v) => ({
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
