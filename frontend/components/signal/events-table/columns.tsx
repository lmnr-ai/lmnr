import { type ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";
import Mono from "@/components/ui/mono.tsx";
import { type EventRow } from "@/lib/events/types.ts";

export const eventsTableColumns: ColumnDef<EventRow>[] = [
  {
    accessorKey: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "ID",
    size: 100,
    id: "id",
  },
  {
    accessorKey: "traceId",
    header: "Trace ID",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    size: 100,
    id: "traceId",
  },
  {
    id: "payload",
    accessorKey: "payload",
    header: "Payload",
    accessorFn: (row) => row.payload,
    cell: ({ getValue, column }) => (
      <JsonTooltip
        data={getValue()}
        columnSize={column.getSize()}
        className="line-clamp-2 break-words whitespace-normal"
      />
    ),
    size: 360,
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    size: 140,
    id: "timestamp",
  },
];

export const defaultEventsColumnOrder = ["id", "traceId", "payload", "timestamp"];

export const eventsTableFilters: ColumnFilter[] = [
  {
    name: "ID",
    key: "id",
    dataType: "string",
  },
  {
    name: "Trace ID",
    key: "trace_id",
    dataType: "string",
  },
  {
    name: "Run ID",
    key: "run_id",
    dataType: "string",
  },
  {
    name: "Payload",
    key: "payload",
    dataType: "json",
  },
];
