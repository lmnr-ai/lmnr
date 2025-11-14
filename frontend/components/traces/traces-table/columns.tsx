import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
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
        className={cn("min-h-6 w-1.5 rounded-[2.5px] bg-success-bright", {
          "bg-destructive-bright": row.getValue() === "error",
          "": row.getValue() === "info", // temporary color values
          "bg-yellow-400": row.getValue() === "warning", // temporary color values
        })}
      />
    ),
    accessorFn: (row) => (row.status === "error" ? "error" : row.analysis_status),
    header: () => <div />,
    id: "status",
    size: 40,
  },
  {
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
    header: "ID",
    accessorKey: "id",
    id: "id",
    size: 150,
  },
  {
    accessorKey: "topSpanType",
    header: "Top level span",
    id: "top_span_type",
    cell: (row) => {
      const topSpanId = row.row.original.topSpanId;
      const hasTopSpan = !!topSpanId && topSpanId !== "00000000-0000-0000-0000-000000000000";
      const isOld = isStringDateOld(row.row.original.endTime);
      const shouldAnimate = !hasTopSpan && !isOld;

      return (
        <div className="cursor-pointer flex gap-2 items-center">
          <div className="flex items-center gap-2">
            {hasTopSpan ? (
              <SpanTypeIcon className="z-10" spanType={row.getValue()} />
            ) : (
              <SpanTypeIcon className={cn("z-10", shouldAnimate && "animate-pulse")} spanType={SpanType.DEFAULT} />
            )}
          </div>
          {hasTopSpan ? (
            <div title={row.row.original.topSpanName} className="text-sm truncate">
              {row.row.original.topSpanName}
            </div>
          ) : row.row.original.topSpanName ? (
            <div
              title={row.row.original.topSpanName}
              className={cn("text-sm truncate text-muted-foreground", shouldAnimate && "animate-pulse")}
            >
              {row.row.original.topSpanName}
            </div>
          ) : (
            <Skeleton className="w-14 h-4 text-secondary-foreground py-0.5 bg-secondary rounded-full text-sm" />
          )}
        </div>
      );
    },
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
              <TooltipTrigger asChild className="relative p-0">
                <div className="truncate">{format.format(row.getValue())}</div>
              </TooltipTrigger>
              <TooltipPortal>
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
              </TooltipPortal>
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
  {
    name: "Pattern",
    key: "pattern",
    dataType: "string",
  },
];
