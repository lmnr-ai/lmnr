import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { type SessionRow } from "@/lib/traces/types";

const format = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 5,
  minimumFractionDigits: 1,
});

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
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Start time",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 150,
  },
  {
    accessorFn: (row) => row.duration.toFixed(2) + "s",
    header: "Duration",
    id: "duration",
    size: 100,
  },
  {
    accessorFn: (row) => format.format(row.totalCost),
    header: "Total cost",
    id: "total_cost",
    size: 120,
  },
  {
    accessorFn: (row) => row.totalTokens,
    header: "Total tokens",
    id: "total_tokens",
    size: 120,
  },
  {
    accessorFn: (row) => row.traceCount ?? 0,
    header: "Trace Count",
    id: "trace_count",
    size: 120,
  },
  {
    accessorFn: (row) => row.userId ?? "-",
    header: "User ID",
    id: "user_id",
    cell: (row) => <Mono className="text-xs">{String(row.getValue())}</Mono>,
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
