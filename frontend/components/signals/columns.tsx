import { type ColumnDef, type Table } from "@tanstack/react-table";
import { isNil } from "lodash";

import DefinitionHoverCard from "@/components/signals/definition-hover-card";
import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { Badge } from "@/components/ui/badge";
import { type SignalRow } from "@/lib/actions/signals";
import { cn, formatRelativeTime } from "@/lib/utils.ts";

// Sparkline data + shared y-scale live on table `meta` rather than in the row,
// because they're fetched separately (per-page batch) after the rows land.
function SparklineCell({ signalId, table }: { signalId: string; table: Table<SignalRow> }) {
  const { data, maxCount } = table.options.meta?.signalsCellMeta ?? {};
  const points = data?.[signalId];

  return (
    <div className="h-full w-full flex items-center">
      <SignalSparkline data={points ?? []} maxCount={maxCount} isLoading={isNil(points)} />
    </div>
  );
}

export const signalsColumns: ColumnDef<SignalRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    size: 240,
    enableSorting: true,
    cell: ({ row }) => (
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("truncate", row.original.disabled && "text-muted-foreground")}>{row.original.name}</span>
        {row.original.disabled && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
            Disabled
          </Badge>
        )}
      </div>
    ),
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
    cell: ({ row, table }) => <SparklineCell signalId={row.original.id} table={table} />,
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
