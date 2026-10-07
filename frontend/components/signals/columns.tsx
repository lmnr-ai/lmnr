import { type ColumnDef } from "@tanstack/react-table";
import { isNil } from "lodash";

import DefinitionHoverCard from "@/components/signals/definition-hover-card";
import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { useSignalSparklines } from "@/components/signals/sparkline-context";
import { Badge } from "@/components/ui/badge";
import { type SignalRow } from "@/lib/actions/signals";
import { cn, formatRelativeTime } from "@/lib/utils.ts";

function SparklineCell({ signalId }: { signalId: string }) {
  const { data, maxCount } = useSignalSparklines();
  const points = data[signalId];

  return (
    <div className="h-full w-full flex items-center">
      <SignalSparkline data={points ?? []} maxCount={maxCount} isLoading={isNil(points)} />
    </div>
  );
}

export const signalsColumns: ColumnDef<SignalRow>[] = [
  {
    id: "status",
    header: "Status",
    size: 90,
    enableSorting: false,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          "rounded-full px-2 text-[10px]",
          row.original.disabled ? "text-muted-foreground" : "bg-primary-400/10 border-primary-400/25 text-primary-400"
        )}
      >
        {row.original.disabled ? "Disabled" : "Active"}
      </Badge>
    ),
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 240,
    enableSorting: true,
    cell: ({ row }) => <span className="truncate">{row.original.name}</span>,
  },
  {
    id: "prompt",
    accessorKey: "prompt",
    header: "Definition",
    size: 400,
    enableSorting: true,
    cell: ({ row }) =>
      row.original.prompt ? (
        <DefinitionHoverCard definition={row.original.prompt} textClassName="text-xs">
          <span className="line-clamp-3 whitespace-normal text-xs text-muted-foreground">{row.original.prompt}</span>
        </DefinitionHoverCard>
      ) : null,
  },
  {
    id: "eventsCount",
    accessorKey: "eventsCount",
    header: "Events",
    size: 80,
    enableSorting: false,
  },
  {
    id: "clustersCount",
    accessorKey: "clustersCount",
    header: "Clusters",
    size: 80,
    enableSorting: false,
  },
  {
    id: "sparkline",
    header: "Activity",
    size: 192,
    enableResizing: false,
    cell: ({ row }) => <SparklineCell signalId={row.original.id} />,
  },
  {
    id: "lastEventAt",
    accessorKey: "lastEventAt",
    header: "Last event",
    size: 130,
    enableSorting: false,
    cell: ({ row }) =>
      row.original.lastEventAt ? (
        <span title={row.original.lastEventAt}>{formatRelativeTime(row.original.lastEventAt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "runsCount",
    accessorKey: "runsCount",
    header: "Runs",
    size: 80,
  },
  {
    id: "versionsCount",
    accessorKey: "versionsCount",
    header: "Versions",
    size: 120,
    cell: ({ row }) => row.original.versionsCount ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: "createdAt",
    accessorKey: "createdAt",
    header: "Created",
    size: 160,
    enableSorting: true,
    sortDescFirst: true,
    cell: ({ row }) => (
      <span title={String(row.original.createdAt)}>{formatRelativeTime(String(row.original.createdAt))}</span>
    ),
  },
];

export const signalsColumnLabels = signalsColumns.map((col) => ({
  id: col.id!,
  label: typeof col.header === "string" ? col.header : col.id!,
}));
