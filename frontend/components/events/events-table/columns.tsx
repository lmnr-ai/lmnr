import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import Mono from "@/components/ui/mono.tsx";
import { EventRow } from "@/lib/events/types.ts";

export const eventsTableColumns: ColumnDef<EventRow>[] = [
  {
    accessorKey: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "ID",
    size: 300,
    id: "id",
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    size: 140,
    id: "timestamp",
  },
  {
    accessorKey: "traceId",
    header: "Trace ID",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    size: 300,
    id: "traceId",
  },
  {
    accessorKey: "spanId",
    header: "Span ID",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    size: 300,
    id: "spanId",
  },
  {
    accessorKey: "userId",
    cell: (row) => <span>{String(row.getValue()) || "-"}</span>,
    header: "User ID",
    size: 200,
    id: "userId",
  },
  {
    id: "sessionId",
    accessorKey: "sessionId",
    cell: (row) => <span>{String(row.getValue()) || "-"}</span>,
    header: "Session ID",
    size: 200,
  },
  {
    id: "attributes",
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
    name: "Cluster",
    key: "cluster",
    dataType: "string",
  },
  {
    name: "Attributes",
    key: "attributes",
    dataType: "json",
  },
];
