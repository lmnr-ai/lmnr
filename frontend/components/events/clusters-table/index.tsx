"use client";

import { useCallback, useMemo } from "react";

import {
  ClusterRow,
  defaultClustersColumnOrder,
  getClusterColumns,
} from "@/components/events/clusters-table/columns.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { EventCluster } from "@/lib/actions/clusters";
import { useToast } from "@/lib/hooks/use-toast.ts";

interface ClustersTableProps {
  projectId: string;
  eventDefinitionId: string;
  eventDefinitionName: string;
}

const FETCH_SIZE = 50;

const PureClustersTable = ({ projectId, eventDefinitionId, eventDefinitionName }: ClustersTableProps) => {
  const { toast } = useToast();
  const columns = useMemo(() => getClusterColumns(projectId, eventDefinitionId), [projectId, eventDefinitionId]);

  const fetchClusters = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        const url = `/api/projects/${projectId}/events/${eventDefinitionName}/clusters?${urlParams.toString()}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }

        const data = (await res.json()) as { items: EventCluster[] };

        return data;
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load clusters. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, eventDefinitionName, toast]
  );

  const {
    data: rawClusters,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    error,
  } = useInfiniteScroll<EventCluster>({
    fetchFn: fetchClusters,
    enabled: true,
    deps: [projectId, eventDefinitionName],
  });

  const { clusters, totalCount } = useMemo(() => {
    if (!rawClusters) return { clusters: [], totalCount: 0 };

    const clusterMap = new Map<string, ClusterRow>();
    const rootClusters: ClusterRow[] = [];

    rawClusters.forEach((cluster) => {
      clusterMap.set(cluster.id, { ...cluster, subRows: [] });
    });

    rawClusters.forEach((cluster) => {
      const node = clusterMap.get(cluster.id);
      if (!node) return;

      if (cluster.parentId === null) {
        rootClusters.push(node);
      } else {
        const parent = clusterMap.get(cluster.parentId);
        if (parent) {
          if (!parent.subRows) parent.subRows = [];
          parent.subRows.push(node);
        }
      }
    });

    const total = rootClusters.reduce((sum, cluster) => sum + cluster.numEvents, 0);

    return { clusters: rootClusters, totalCount: total };
  }, [rawClusters]);

  return (
    <InfiniteDataTable<ClusterRow>
      className="w-full"
      columns={columns}
      data={clusters}
      getRowId={(cluster) => cluster.id}
      lockedColumns={["expand", "name"]}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
      error={error}
      loadMoreButton
      meta={{ totalCount }}
    >
      <div className="flex flex-1 w-full space-x-2">
        <ColumnsMenu
          columnLabels={columns.map((column) => ({
            id: column.id!,
            label: typeof column.header === "string" ? column.header : column.id!,
          }))}
          lockedColumns={["expand", "name"]}
        />
      </div>
    </InfiniteDataTable>
  );
};

export default function ClustersTable({ projectId, eventDefinitionId, eventDefinitionName }: ClustersTableProps) {
  return (
    <DataTableStateProvider storageKey="clusters-table" uniqueKey="id" defaultColumnOrder={defaultClustersColumnOrder}>
      <PureClustersTable
        projectId={projectId}
        eventDefinitionId={eventDefinitionId}
        eventDefinitionName={eventDefinitionName}
      />
    </DataTableStateProvider>
  );
}
