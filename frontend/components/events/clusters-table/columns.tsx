import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { Button } from "@/components/ui/button";
import { EventCluster } from "@/lib/actions/clusters";
import { cn, TIME_SECONDS_FORMAT } from "@/lib/utils.ts";

export interface ClusterRow extends EventCluster {
  subRows?: ClusterRow[];
}

interface ClusterTableMeta {
  totalCount: number;
}

export const getClusterColumns = (projectId: string, eventType: "SEMANTIC" | "CODE", eventDefinitionId: string): ColumnDef<ClusterRow, any>[] => [
  {
    header: "",
    cell: ({ row }) =>
      (row.original.numChildrenClusters > 0 && row.original.level > 1) ? (
        <Button
          icon={row.getIsExpanded() ? "chevronDown" : "chevronRight"}
          variant="ghost"
          className="p-0 h-5 text-secondary-foreground focus-visible:outline-0"
          onClick={() => row.toggleExpanded()}
        />
      ) : (
        <div className="min-w-5 min-h-5" />
      ),
    id: "expand",
    size: 44,
  },
  {
    accessorFn: (row) => row.name,
    header: "Cluster",
    id: "name",
    cell: ({ row }) => {
      const depth = row.depth; // Use actual nesting depth in the table
      const paddingLeft = depth * 24; // 24px per depth level

      // Create filter URL for events page with the cluster name
      // Preserve existing URL parameters
      const currentUrl = typeof window !== "undefined" ? new URL(window.location.href) : null;
      const params = currentUrl ? new URLSearchParams(currentUrl.search) : new URLSearchParams();

      // Add the cluster filter to existing filters
      const clusterFilter = JSON.stringify({
        column: "cluster",
        operator: "eq",
        value: row.original.name,
      });
      params.append("filter", clusterFilter);

      const eventsUrl = `/project/${projectId}/events/${eventType.toLowerCase()}/${eventDefinitionId}?${params.toString()}`;

      return (
        <div style={{ paddingLeft: `${paddingLeft}px` }} className="truncate text-primary">
          <Link href={eventsUrl} onClick={(e) => e.stopPropagation()}>
            {row.original.name}
          </Link>
        </div>
      );
    },
    size: 350,
  },
  {
    accessorFn: (row) => row.level > 1 ? String(row.numChildrenClusters) : '',
    header: "Sub clusters",
    id: "children_clusters",
    size: 120,
  },
  {
    accessorFn: (row) => row.numEvents,
    header: "Events",
    id: "events",
    size: 100,
  },
  {
    accessorFn: (row) => row.numEvents,
    header: "Distribution",
    id: "distribution",
    cell: ({ row, table }) => {
      const meta = table.options.meta as ClusterTableMeta | undefined;
      const totalEvents = meta?.totalCount ?? 0;

      const percentage = totalEvents > 0 ? (row.original.numEvents / totalEvents) * 100 : 0;

      return (
        <span className={cn("shrink-0", percentage > 0 ? "text-secondary-foreground" : "text-muted-foreground")}>
          {percentage.toFixed(1)}%
        </span>
      );
    },
    size: 115,
  },
  {
    accessorFn: (row) => row.createdAt,
    header: "Created",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "created_at",
    size: 150,
  },
  {
    accessorFn: (row) => row.updatedAt,
    header: "Updated",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "updated_at",
    size: 150,
  },
];

export const defaultClustersColumnOrder = [
  "expand",
  "name",
  "children_clusters",
  "events",
  "distribution",
  "created_at",
  "updated_at",
];
