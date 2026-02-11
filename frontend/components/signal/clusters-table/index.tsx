"use client";

import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ClusterRow,
  defaultClustersColumnOrder,
  getClusterColumns,
} from "@/components/signal/clusters-table/columns.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { TableCell, TableRow } from "@/components/ui/table";
import { type EventCluster } from "@/lib/actions/clusters";
import { useToast } from "@/lib/hooks/use-toast.ts";

const EmptyRow = (
  <TableRow className="flex">
    <TableCell className="text-center p-4 rounded-b w-full h-auto">
      <div className="flex flex-1 justify-center">
        <div className="flex flex-col gap-2 items-center max-w-md">
          <h3 className="text-base font-medium text-secondary-foreground">No clusters yet</h3>
          <p className="text-sm text-muted-foreground text-center">
            Clusters group similar events together for easier analysis and it's performed automatically in the background.
            If you don't see any clusters, most likely there's not enough data for distinct cluster to appear.
          </p>
        </div>
      </div>
    </TableCell>
  </TableRow>
);

const PureClustersTable = () => {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const signal = useSignalStoreContext((state) => state.signal);
  const columns = useMemo(() => getClusterColumns(params.projectId, signal.id), [params.projectId, signal.id]);

  const [rawClusters, setRawClusters] = useState<EventCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClusters = useCallback(async () => {
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${params.projectId}/events/${signal.name}/clusters`);

      if (!res.ok) {
        const text = (await res.json()) as { error: string };
        throw new Error(text.error);
      }

      const data = (await res.json()) as { items: EventCluster[] };
      setRawClusters(data.items);
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Failed to load clusters. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [params.projectId, signal.name, toast]);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const { clusters, totalCount } = useMemo(() => {
    if (!rawClusters.length) return { clusters: [], totalCount: 0 };

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
    <div className="flex flex-col gap-2">
      <div className="flex gap-4">
        <span className="text-lg font-semibold">Clusters</span>
      </div>
      <InfiniteDataTable<ClusterRow>
        className="w-full"
        columns={columns}
        data={clusters}
        getRowId={(cluster) => cluster.id}
        lockedColumns={["expand", "name"]}
        hasMore={false}
        isFetching={false}
        isLoading={isLoading}
        fetchNextPage={() => { }}
        meta={{ totalCount }}
        emptyRow={EmptyRow}
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
    </div>
  );
};

export default function ClustersTable() {
  return (
    <DataTableStateProvider storageKey="clusters-table" uniqueKey="id" defaultColumnOrder={defaultClustersColumnOrder}>
      <PureClustersTable />
    </DataTableStateProvider>
  );
}
