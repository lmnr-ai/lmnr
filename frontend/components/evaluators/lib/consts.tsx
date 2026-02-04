import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type Evaluator } from "@/lib/evaluators/types";

export const columns: ColumnDef<Evaluator>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
  },
  {
    id: "evaluatorType",
    accessorKey: "evaluatorType",
    header: "Type",
    cell: ({ row }) => <div className="text-sm text-muted-foreground">{row.getValue("evaluatorType")}</div>,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => <ClientTimestampFormatter absolute timestamp={row.getValue("createdAt")} />,
  },
];

export const defaultEvaluatorsColumnOrder = ["__row_selection", "name", "evaluatorType", "createdAt"];
