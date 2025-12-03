import { ChevronDownIcon } from "@radix-ui/react-icons";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { TIME_SECONDS_FORMAT } from "@/lib/utils";

export type ClusterRow = {
  id: string;
  clusterId: string;
  name: string;
  level: number;
  parentId: string | null;
  numChildrenClusters: number;
  numEvents: number;
  createdAt: string;
  updatedAt: string;
  subRows?: ClusterRow[];
};

export const getClusterColumns = (projectId: string, eventDefinitionId: string, eventDefinitionName: string): ColumnDef<ClusterRow, any>[] => [
  {
    header: "",
    cell: ({ row }) =>
      row.original.numChildrenClusters > 0 ? (
        <div className="flex items-center gap-2">
          {row.getIsExpanded() ? (
            <ChevronDownIcon className="min-w-4 min-h-4 text-secondary-foreground" />
          ) : (
            <ChevronRightIcon className="min-w-4 min-h-4 text-secondary-foreground" />
          )}
        </div>
      ) : (
        <div className="w-4" />
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
      const currentUrl = typeof window !== 'undefined' ? new URL(window.location.href) : null;
      const params = currentUrl ? new URLSearchParams(currentUrl.search) : new URLSearchParams();

      // Add the cluster filter to existing filters
      const clusterFilter = JSON.stringify({
        column: "cluster",
        operator: "eq",
        value: row.original.name,
      });
      params.append("filter", clusterFilter);

      const eventsUrl = `/project/${projectId}/events/${eventDefinitionId}?${params.toString()}`;

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
    accessorFn: (row) => row.numChildrenClusters,
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

export const defaultClustersColumnOrder = ["expand", "name", "children_clusters", "events", "created_at", "updated_at"];

export const clustersTableFilters: ColumnFilter[] = [
  {
    name: "Cluster",
    key: "name",
    dataType: "string",
  },
  {
    name: "Children clusters",
    key: "numChildrenClusters",
    dataType: "number",
  },
  {
    name: "Events",
    key: "numEvents",
    dataType: "number",
  },
];

