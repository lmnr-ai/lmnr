import { ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { EventDefinition } from "@/components/event-definitions/event-definitions-store.tsx";
import JsonTooltip from "@/components/ui/json-tooltip.tsx";

export const columns: ColumnDef<EventDefinition>[] = [
  {
    header: "Name",
    accessorFn: (row) => row.name,
    cell: ({ row }) => <span className="truncate">{row.original.name}</span>,
  },
  {
    header: "Created At",
    accessorFn: (row) => row.createdAt,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
  },
  {
    header: "Prompt",
    accessorFn: (row) => row.prompt,
    cell: ({ row }) => <span className="truncate">{row.original.prompt}</span>,
  },
  {
    header: "Structured Output",
    id: "structuredOutput",
    accessorFn: (row) => row.structuredOutput,
    cell: ({ getValue, column }) => <JsonTooltip data={getValue()} columnSize={column.getSize()} />,
  },
  {
    header: "Semantic",
    accessorFn: (row) => row.isSemantic,
    cell: ({ row }) => (row.original.isSemantic ? "Yes" : "No"),
  },
];
