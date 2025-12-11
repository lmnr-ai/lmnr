"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ClusterRow,
  defaultClustersColumnOrder,
  getClusterColumns,
} from "@/components/events/clusters-table/columns.tsx";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import { EventCluster } from "@/lib/actions/clusters";
import { useToast } from "@/lib/hooks/use-toast.ts";

interface ClustersTableProps {
  projectId: string;
  eventDefinitionId: string;
  eventDefinitionName: string;
  eventType: "SEMANTIC" | "CODE";
}

const PureClustersTable = ({ projectId, eventDefinitionId, eventDefinitionName, eventType }: ClustersTableProps) => {
  const { toast } = useToast();
  const columns = useMemo(() => getClusterColumns(projectId, eventType, eventDefinitionId), [projectId, eventDefinitionId]);

  const [rawClusters, setRawClusters] = useState<EventCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClusters = useCallback(async () => {
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/events/${eventDefinitionName}/clusters?eventSource=${eventType}`);

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
  }, [projectId, eventDefinitionName, eventType, toast]);

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

export default function ClustersTable({ projectId, eventDefinitionId, eventDefinitionName, eventType }: ClustersTableProps) {
  return (
    <DataTableStateProvider storageKey="clusters-table" uniqueKey="id" defaultColumnOrder={defaultClustersColumnOrder}>
      <PureClustersTable
        projectId={projectId}
        eventDefinitionId={eventDefinitionId}
        eventDefinitionName={eventDefinitionName}
        eventType={eventType}
      />
    </DataTableStateProvider>
  );
}
