import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";

import { type TaskRow } from "./rows";
import VersionLabel from "./version-label";

export const taskColumns: ColumnDef<TaskRow>[] = [
  {
    id: "task",
    header: "Task",
    size: 360,
    cell: ({ row }) => <span className="font-medium">{row.original.taskId}</span>,
  },
  {
    id: "version",
    header: "Latest version",
    size: 240,
    cell: ({ row }) => <VersionLabel version={row.original.latest} />,
  },
  {
    id: "pushedAt",
    header: "Last pushed",
    size: 200,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.latest.pushedAt} />,
  },
  {
    id: "createdAt",
    header: "Created",
    size: 200,
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
  },
];
