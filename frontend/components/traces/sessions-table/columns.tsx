import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { CostCell, DurationCell, TokensCell } from "@/components/traces/cells";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { type SessionRow } from "@/lib/traces/types";

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
    accessorFn: (row) => row.duration ?? 0,
    header: "Duration",
    id: "duration",
    size: 100,
    meta: { sql: "duration" },
    // SessionRow.duration is stored in seconds; convert to ms for the cell.
    cell: (row) => <DurationCell durationMs={((row.getValue() as number) ?? 0) * 1000} />,
  },
  {
    accessorFn: (row) => row.totalCost,
    header: "Cost",
    id: "total_cost",
    meta: { sql: "total_cost" },
    cell: (row) => <CostCell stats={row.row.original} />,
    size: 100,
  },
  {
    accessorFn: (row) => row.totalTokens ?? 0,
    header: "Tokens",
    id: "total_tokens",
    meta: { sql: "total_tokens" },
    cell: (row) => <TokensCell stats={row.row.original} showCacheInline />,
    size: 220,
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
