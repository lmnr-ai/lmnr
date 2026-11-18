import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type EvalDatasetVersionItem, evaluationGroupOf } from "@/lib/actions/eval-datasets/types";

import { versionEvaluationsHref } from "../constants";

export const versionsColumns = (projectId: string, dataset: string): ColumnDef<EvalDatasetVersionItem>[] => [
  { id: "version", header: "Version", accessorFn: (row) => `v${row.version}`, size: 100 },
  { id: "message", header: "Message", accessorFn: (row) => row.message ?? "", size: 360 },
  {
    id: "parentVersion",
    header: "Parent",
    accessorFn: (row) => (row.parentVersion === null ? "–" : `v${row.parentVersion}`),
    size: 100,
  },
  {
    id: "author",
    header: "Author",
    accessorFn: (row) => row.authorName ?? "–",
    cell: ({ row }) => <span title={row.original.authorEmail ?? undefined}>{row.original.authorName ?? "–"}</span>,
    size: 180,
  },
  {
    id: "createdAt",
    header: "Created",
    cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.createdAt} />,
    size: 180,
  },
  { id: "taskCount", header: "Tasks", accessorKey: "taskCount", size: 100 },
  {
    id: "evaluations",
    header: "Evaluations",
    cell: ({ row }) =>
      row.original.runCount > 0 ? (
        <Link
          href={versionEvaluationsHref(projectId, evaluationGroupOf(dataset, row.original.version))}
          // The row itself links to the version.
          onClick={(event) => event.stopPropagation()}
          className="text-primary-text hover:underline"
        >
          {row.original.runCount === 1 ? "1 run" : `${row.original.runCount} runs`}
        </Link>
      ) : (
        <span className="text-muted-foreground">No runs</span>
      ),
    size: 140,
  },
];

export const VERSIONS_COLUMN_ORDER = versionsColumns("", "").map((column) => column.id!);
