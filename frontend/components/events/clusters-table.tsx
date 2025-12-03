"use client";

import { Row } from "@tanstack/react-table";
import { get } from "lodash";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import {
  ClusterRow,
  defaultClustersColumnOrder,
  getClusterColumns,
} from "@/components/events/clusters-columns";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { useToast } from "@/lib/hooks/use-toast";

interface ClustersTableProps {
  projectId: string;
  eventDefinitionId: string;
  eventDefinitionName: string;
}

export default function ClustersTable({ projectId, eventDefinitionId, eventDefinitionName }: ClustersTableProps) {
  return (
    <DataTableStateProvider
      storageKey={`clusters-table-${eventDefinitionId}`}
      uniqueKey="clusterId"
      defaultColumnOrder={defaultClustersColumnOrder}
    >
      <ClustersTableContent
        projectId={projectId}
        eventDefinitionId={eventDefinitionId}
        eventDefinitionName={eventDefinitionName}
      />
    </DataTableStateProvider>
  );
}

function ClustersTableContent({ projectId, eventDefinitionId, eventDefinitionName }: ClustersTableProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const columns = useMemo(() => getClusterColumns(projectId, eventDefinitionId, eventDefinitionName), [projectId, eventDefinitionId, eventDefinitionName]);

  const filter = searchParams.getAll("clusterFilter");
  const search = searchParams.get("clusterSearch");

  const FETCH_SIZE = 50;

  const fetchClusters = useCallback(
    async (pageNumber: number) => {
      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());

        filter.forEach((f) => urlParams.append("filter", f));

        if (typeof search === "string" && search.length > 0) {
          urlParams.set("search", search);
        }

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

        const data = (await res.json()) as { items: ClusterRow[] };
        return { items: data.items };
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load clusters. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, eventDefinitionId, eventDefinitionName, toast, filter, search]
  );

  const {
    data: rawClusters,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
    error,
  } = useInfiniteScroll<ClusterRow>({
    fetchFn: fetchClusters,
    enabled: true,
    deps: [projectId, eventDefinitionId, filter, search],
  });

  const clusters = useMemo(() => {
    if (!rawClusters) return [];

    if (filter.length > 0 || (search && search.length > 0)) {
      return rawClusters.map((cluster) => ({
        ...cluster,
        subRows: [],
      }));
    }

    const clusterMap = new Map<string, ClusterRow>();
    const rootClusters: ClusterRow[] = [];

    rawClusters.forEach((cluster) => {
      clusterMap.set(cluster.clusterId, { ...cluster, subRows: [] });
    });

    rawClusters.forEach((cluster) => {
      const node = clusterMap.get(cluster.clusterId);
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

    return rootClusters;
  }, [rawClusters, filter, search]);

  const handleRowClick = useCallback((row: Row<ClusterRow>) => {
    if (row.original.numChildrenClusters > 0) {
      row.toggleExpanded();
    }
  }, []);

  return (
    <div className="flex overflow-hidden">
      <InfiniteDataTable<ClusterRow>
        className="w-full"
        columns={columns}
        data={clusters}
        getRowId={(cluster) => get(cluster, ["clusterId"], cluster.clusterId)}
        onRowClick={handleRowClick}
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        fetchNextPage={fetchNextPage}
        error={error}
      >
        {/* <div className="flex flex-1 w-full space-x-2 pt-1">
          <DataTableFilter columns={clustersTableFilters} />
          <ColumnsMenu
            columnLabels={columns.map((column) => ({
              id: column.id!,
              label: typeof column.header === "string" ? column.header : column.id!,
            }))}
            lockedColumns={["expand"]}
          />
          <RefreshButton onClick={refetch} variant="outline" />
          <DataTableSearch className="mr-0.5" placeholder="Search by cluster name..." />
        </div> */}
        {/* <DataTableFilterList /> */}
      </InfiniteDataTable>
    </div>
  );
}

