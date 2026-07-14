import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { CostCell, DurationCell, TokensCell } from "@/components/traces/cells";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { type SessionRow } from "@/lib/traces/types";

// Ingestion maps NULL Postgres times to epoch 0 in ClickHouse, so an all-in-flight session would render as 1970.
export const isRenderableActivity = (value: unknown): boolean =>
  Boolean(value) && new Date(String(value)).getTime() > 0;

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
      <CopyTooltip value={String(row.getValue())} className="block truncate">
        <Mono className="text-xs">{row.getValue()}</Mono>
      </CopyTooltip>
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
    enableSorting: true,
    meta: { sql: "start_time" },
  },
  {
    accessorFn: (row) => row.endTime,
    header: "Last activity",
    cell: (row) =>
      isRenderableActivity(row.getValue()) ? <ClientTimestampFormatter timestamp={String(row.getValue())} /> : "-",
    id: "end_time",
    size: 150,
    enableSorting: true,
    meta: { sql: "end_time" },
  },
  {
    accessorFn: (row) => (row.duration ?? 0).toFixed(2) + "s",
    header: "Duration",
    id: "duration",
    size: 100,
    enableSorting: true,
    meta: { sql: "duration" },
    // SessionRow.duration is stored in seconds; convert to ms for the cell.
    cell: (row) => <DurationCell durationMs={((row.getValue() as number) ?? 0) * 1000} />,
  },
  {
    accessorFn: (row) => row.totalCost,
    header: "Cost",
    id: "total_cost",
    enableSorting: true,
    meta: { sql: "total_cost" },
    cell: (row) => <CostCell stats={row.row.original} />,
    size: 100,
  },
  {
    accessorFn: (row) => row.totalTokens ?? 0,
    header: "Tokens",
    id: "total_tokens",
    enableSorting: true,
    meta: { sql: "total_tokens" },
    cell: (row) => <TokensCell stats={row.row.original} showCacheInline />,
    size: 220,
  },
  {
    accessorFn: (row) => row.traceCount ?? 0,
    header: "Traces",
    id: "trace_count",
    size: 100,
    enableSorting: true,
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
  "end_time",
  "duration",
  "total_cost",
  "total_tokens",
  "trace_count",
  "user_id",
];
