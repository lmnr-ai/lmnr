import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { parseTimestampToMs } from "@/lib/time/timestamp";
import { SpanType, type TraceRow } from "@/lib/traces/types";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

export const sidebarTraceColumns: ColumnDef<TraceRow, any>[] = [
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
    header: "Time",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 120,
  },
  {
    accessorFn: (row) => {
      const startMs = parseTimestampToMs(row.startTime);
      const endMs = parseTimestampToMs(row.endTime);
      if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) return "-";
      return `${((endMs - startMs) / 1000).toFixed(2)}s`;
    },
    header: "Duration",
    id: "duration",
    size: 120,
  },
  {
    accessorFn: (row) => row.totalTokens ?? "-",
    header: "Tokens",
    id: "total_tokens",
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
];

export const sidebarColumnOrder = ["status", "top_span_type", "start_time", "duration", "total_tokens"];

export const FETCH_SIZE = 30;
