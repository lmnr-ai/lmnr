import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils.ts";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import Mono from "@/components/ui/mono.tsx";
import { EventRow } from "@/lib/events/types.ts";

export const eventsTableColumns: ColumnDef<EventRow>[] = [
  {
    accessorKey: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "ID",
    size: 300,
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 200,
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
    header: "User ID",
    size: 200,
  },
  {
    accessorKey: "sessionId",
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

export const eventsTableFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Name",
    key: "name",
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
