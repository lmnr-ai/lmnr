import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type EvalDatasetListItem } from "@/lib/actions/eval-datasets/types";

export const evalDatasetsColumns: ColumnDef<EvalDatasetListItem>[] = [
  { id: "name", accessorKey: "name", header: "Name", size: 320 },
  {
    id: "latestVersion",
    header: "Latest version",
    accessorFn: (row) => (row.latestVersion === null ? "–" : `v${row.latestVersion}`),
    size: 140,
  },
  { id: "taskCount", header: "Tasks", accessorFn: (row) => row.taskCount ?? "–", size: 120 },
  {
    id: "updatedAt",
    header: "Updated",
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.updatedAt} />,
    size: 200,
  },
];
