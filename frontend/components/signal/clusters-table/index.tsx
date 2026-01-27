"use client";

import { Network } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ClusterRow,
  defaultClustersColumnOrder,
  getClusterColumns,
} from "@/components/signal/clusters-table/columns.tsx";
import DisableClusteringDialog from "@/components/signal/disable-clustering-dialog.tsx";
import StartClusteringDialog from "@/components/signal/start-clustering-dialog.tsx";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { type EventCluster } from "@/lib/actions/clusters";
import { useToast } from "@/lib/hooks/use-toast.ts";

const PureClustersTable = () => {
  const { toast } = useToast();
  const params = useParams<{ projectId: string }>();
  const { signal, clusterConfig } = useSignalStoreContext((state) => ({
    signal: state.signal,
    clusterConfig: state.clusterConfig,
  }));
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
  }, [params.projectId, toast]);

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
        {clusterConfig ? (
          <DisableClusteringDialog>
            <Button variant="secondary">
              <Network className="mr-1 size-3.5" />
              Disable Clustering
            </Button>
          </DisableClusteringDialog>
        ) : (
          <StartClusteringDialog>
            <Button variant="secondary" className="w-fit">
              <Network className="mr-1 size-3.5" />
              Start Clustering
            </Button>
          </StartClusteringDialog>
        )}
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
        fetchNextPage={() => {}}
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
