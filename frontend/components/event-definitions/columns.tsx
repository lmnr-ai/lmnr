import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { EventDefinitionRow } from "@/lib/actions/event-definitions";

export const columns: ColumnDef<EventDefinitionRow>[] = [
  {
    header: "Name",
    accessorFn: (row) => row.name,
    cell: ({ row }) => <span className="truncate">{row.original.name}</span>,
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
  },
  {
    header: "Created At",
    accessorFn: (row) => row.createdAt,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
  },
];
