import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type EvalTaskSummary } from "@/lib/actions/eval-datasets/types";

export const taskColumns: ColumnDef<EvalTaskSummary>[] = [
  {
    id: "task",
    header: "Task",
    size: 360,
    cell: ({ row }) => <span className="font-medium">{row.original.id}</span>,
  },
  {
    id: "versionCount",
    header: "Versions",
    size: 120,
    cell: ({ row }) => row.original.versionCount,
  },
  {
    id: "lastPushedAt",
    header: "Last pushed",
    size: 200,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.lastPushedAt} />,
  },
  {
    id: "createdAt",
    header: "Created",
    size: 200,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
  },
];
