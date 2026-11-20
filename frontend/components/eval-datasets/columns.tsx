import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type EvalDatasetSummary } from "@/lib/actions/eval-datasets/types";

export const evalDatasetsColumns: ColumnDef<EvalDatasetSummary>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "id",
    size: 360,
    cell: ({ row }) => <span className="font-medium">{row.original.id}</span>,
  },
  {
    id: "taskCount",
    header: "Tasks",
    accessorKey: "taskCount",
    size: 120,
  },
  {
    id: "lastPushedAt",
    header: "Last pushed",
    size: 220,
    cell: ({ row }) =>
      row.original.lastPushedAt ? (
        <ClientTimestampFormatter timestamp={row.original.lastPushedAt} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    id: "createdAt",
    header: "Created",
    size: 220,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
  },
];
