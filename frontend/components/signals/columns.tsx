import { type ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { Badge } from "@/components/ui/badge.tsx";
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
    header: "Trigger Spans",
    id: "triggerSpans",
    accessorFn: (row) => row.triggerSpans,
    cell: (row) => {
      const spans = row.getValue() as string[];

      if (spans?.length > 0) {
        return (
          <>
            {spans.map((span) => (
              <Badge key={span} className="rounded-3xl mr-1" variant="outline">
                <span>{span}</span>
              </Badge>
            ))}
          </>
        );
      }
      return "-";
    },
  },
  {
    header: "Created",
    accessorFn: (row) => row.createdAt,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
    id: "createdAt",
  },
];

export const defaultSignalsColumnsOrder = ["__row_selection", "name", "triggerSpans", "createdAt"];
