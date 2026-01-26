import { type ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type SignalRow } from "@/lib/actions/signals";

export const signalsTableFilters: ColumnFilter[] = [
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
];

export const signalsColumns: ColumnDef<SignalRow>[] = [
  {
    header: "Name",
    accessorFn: (row) => row.name,
    cell: ({ row }) => <span className="truncate">{row.original.name}</span>,
    id: "name",
  },
  {
    header: "Events",
    id: "eventsCount",
    accessorFn: (row) => row.eventsCount,
    cell: ({ row }) => <span className="truncate">{row.original.eventsCount}</span>,
  },
  {
    header: "Created",
    accessorFn: (row) => row.createdAt,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
    id: "createdAt",
  },
];

export const defaultSignalsColumnsOrder = ["__row_selection", "name", "triggersCount", "eventsCount", "createdAt"];
