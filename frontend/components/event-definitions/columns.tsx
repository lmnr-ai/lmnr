import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { EventDefinitionRow } from "@/lib/actions/event-definitions";

export const columns: ColumnDef<EventDefinitionRow>[] = [
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
    header: "Semantic",
    accessorFn: (row) => row.isSemantic,
    cell: ({ row }) => (row.original.isSemantic ? "Yes" : "No"),
    id: "isSemantic",
  },
  {
    header: "Created At",
    accessorFn: (row) => row.createdAt,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
    id: "createdAt",
  },
];

export const defaultEventDefinitionsColumnOrder = [
  "__row_selection",
  "name",
  "triggerSpans",
  "isSemantic",
  "createdAt",
];

export const eventsDefinitionsTableFilters: ColumnFilter[] = [
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
];
