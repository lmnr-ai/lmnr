import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type EvalDatasetTaskItem, shortHash } from "@/lib/actions/eval-datasets/types";

export const tasksColumns: ColumnDef<EvalDatasetTaskItem>[] = [
  { id: "name", accessorKey: "name", header: "Task", size: 160 },
  {
    id: "hash",
    header: "Latest version",
    cell: ({ row }) => <span className="font-mono text-xs">{shortHash(row.original.hash)}</span>,
    size: 125,
  },
  { id: "versionCount", accessorKey: "versionCount", header: "Versions", size: 80 },
  {
    id: "updatedAt",
    header: "Updated",
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.updatedAt} />,
    size: 100,
  },
];

export const TASKS_COLUMN_ORDER = tasksColumns.map((column) => column.id!);
