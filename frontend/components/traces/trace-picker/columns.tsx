import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SpanType, type TraceRow } from "@/lib/traces/types";
import { isStringDateOld } from "@/lib/traces/utils";
import { cn } from "@/lib/utils";

const StatusCell = ({ value }: { value: unknown }) => (
  <div
    className={cn("min-h-6 w-1.5 rounded-[2.5px] bg-success-bright", {
      "bg-destructive-bright": value === "error",
      "": value === "info",
      "bg-yellow-400": value === "warning",
    })}
  />
);

const TopSpanCell = ({ row }: { row: TraceRow }) => {
  const topSpanId = row.topSpanId;
  const hasTopSpan = !!topSpanId && topSpanId !== "00000000-0000-0000-0000-000000000000";
  const isOld = isStringDateOld(row.endTime);
  const shouldAnimate = !hasTopSpan && !isOld;

  return (
    <div className="cursor-pointer flex gap-2 items-center">
      <div className="flex items-center gap-2">
        {hasTopSpan ? (
          <SpanTypeIcon className="z-10" spanType={row.topSpanType ?? SpanType.DEFAULT} />
        ) : (
          <SpanTypeIcon className={cn("z-10", shouldAnimate && "animate-pulse")} spanType={SpanType.DEFAULT} />
        )}
      </div>
      {hasTopSpan ? (
        <div title={row.topSpanName} className="text-sm truncate">
          {row.topSpanName}
        </div>
      ) : row.topSpanName ? (
        <div
          title={row.topSpanName}
          className={cn("text-sm truncate text-muted-foreground", shouldAnimate && "animate-pulse")}
        >
          {row.topSpanName}
        </div>
      ) : (
        <Skeleton className="w-14 h-4 text-secondary-foreground py-0.5 bg-secondary rounded-full text-sm" />
      )}
    </div>
  );
};

const TokensCell = ({ row }: { row: TraceRow }) => (
  <div className="truncate">
    {`${row.inputTokens ?? "-"}`}
    {" → "}
    {`${row.outputTokens ?? "-"}`}
    {` (${row.totalTokens ?? "-"})`}
  </div>
);

export const tracePickerColumns: ColumnDef<TraceRow, any>[] = [
  {
    cell: (row) => <StatusCell value={row.getValue()} />,
    accessorFn: (row) => (row.status === "error" ? "error" : row.analysis_status),
    header: () => <div />,
    id: "status",
    size: 40,
  },
  {
    accessorKey: "topSpanType",
    header: "Top level span",
    id: "top_span_type",
    cell: (row) => <TopSpanCell row={row.row.original} />,
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
      const start = new Date(row.startTime);
      const end = new Date(row.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return "-";
      return `${((end.getTime() - start.getTime()) / 1000).toFixed(2)}s`;
    },
    header: "Duration",
    id: "duration",
    size: 120,
  },
  {
    accessorFn: (row) => row.totalTokens ?? "-",
    header: "Tokens",
    id: "total_tokens",
    cell: (row) => <TokensCell row={row.row.original} />,
    size: 150,
  },
];

export const tracePickerColumnOrder = ["status", "top_span_type", "start_time", "duration", "total_tokens"];

export const FETCH_SIZE = 30;
