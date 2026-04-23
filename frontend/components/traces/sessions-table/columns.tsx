import { TooltipPortal } from "@radix-ui/react-tooltip";
import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SessionRow } from "@/lib/traces/types";

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

const numberFormat = new Intl.NumberFormat("en-US");

const formatTokens = (value: number | null | undefined) => (value == null ? "-" : numberFormat.format(value));

export const filters: ColumnFilter[] = [
  {
    key: "session_id",
    name: "Session ID",
    dataType: "string",
  },
  {
    key: "user_id",
    name: "User ID",
    dataType: "string",
  },
  {
    key: "trace_count",
    name: "Trace Count",
    dataType: "number",
  },
  {
    key: "duration",
    name: "Duration",
    dataType: "number",
  },
  {
    key: "total_tokens",
    name: "Total Tokens",
    dataType: "number",
  },
  {
    key: "total_cost",
    name: "Total Cost",
    dataType: "number",
  },
];

export const columns: ColumnDef<SessionRow, any>[] = [
  {
    accessorFn: (row) => row.sessionId,
    header: "ID",
    id: "id",
    cell: (row) => (
      <div className="min-h-6 flex items-center">
        <Mono className="text-xs truncate">{row.getValue()}</Mono>
      </div>
    ),
    size: 200,
    meta: { sql: "session_id" },
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 150,
    meta: { sql: "start_time" },
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
    size: 100,
    meta: { sql: "duration" },
  },
  {
    accessorFn: (row) => row.totalCost,
    header: "Cost",
    id: "total_cost",
    meta: { sql: "total_cost" },
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
    size: 120,
  },
  {
    accessorFn: (row) => row.totalTokens ?? "-",
    header: "Tokens",
    id: "total_tokens",
    meta: { sql: "total_tokens" },
    cell: (row) => (
      <div className="truncate">
        {formatTokens(row.row.original.inputTokens)}
        {" → "}
        {formatTokens(row.row.original.outputTokens)}
        {` (${formatTokens(row.row.original.totalTokens)})`}
      </div>
    ),
    size: 180,
  },
  {
    accessorFn: (row) => row.traceCount ?? 0,
    header: "Traces",
    id: "trace_count",
    size: 100,
    meta: { sql: "trace_count" },
  },
  {
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
    accessorFn: (row) => row.userId ?? "-",
    header: "User ID",
    id: "user_id",
    meta: { sql: "user_id" },
  },
];

export const defaultSessionsColumnOrder = [
  "id",
  "start_time",
  "duration",
  "total_cost",
  "total_tokens",
  "trace_count",
  "user_id",
];
