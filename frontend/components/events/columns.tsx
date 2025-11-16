import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import Mono from "@/components/ui/mono.tsx";
import { EventRow } from "@/lib/events/types.ts";
import { ColumnFilter } from "@/widgets/ui/infinite-datatable/ui/datatable-filter/utils.ts";

export const eventsTableColumns: ColumnDef<EventRow>[] = [
  {
    accessorKey: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "ID",
    size: 300,
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    size: 200,
  },
  {
    accessorKey: "traceId",
    header: "Trace ID",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    size: 300,
  },
  {
    accessorKey: "spanId",
    header: "Span ID",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    size: 300,
  },
  {
    accessorKey: "userId",
    cell: (row) => <span>{String(row.getValue()) || "-"}</span>,
    header: "User ID",
    size: 200,
  },
  {
    accessorKey: "sessionId",
    cell: (row) => <span>{String(row.getValue()) || "-"}</span>,
    header: "Session ID",
    size: 200,
  },
  {
    accessorKey: "attributes",
    header: "Attributes",
    accessorFn: (row) => row.attributes,
    cell: ({ getValue, column }) => <JsonTooltip data={getValue()} columnSize={column.getSize()} />,
  },
];

export const defaultEventsColumnOrder = ["id", "timestamp", "traceId", "spanId", "userId", "sessionId", "attributes"];

export const eventsTableFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "User ID",
    key: "user_id",
    dataType: "string",
  },
  {
    name: "Session ID",
    key: "session_id",
    dataType: "string",
  },
  {
    name: "Attributes",
    key: "attributes",
    dataType: "json",
  },
];
