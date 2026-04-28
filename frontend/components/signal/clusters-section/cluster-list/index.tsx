"use client";

import { shallow } from "zustand/shallow";

import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import {
  getUnclusteredVirtualCluster,
  getVisibleClusters,
  selectUnclusteredCount,
  useSignalStoreContext,
} from "@/components/signal/store";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { getClusterColor, UNCLUSTERED_COLOR } from "../colors";
import ClusterItem, { type IconVariant } from "./cluster-item";

interface ClusterListProps {
  displayId: string | null;
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  onNavigateToCluster: (clusterId: string) => void;
  className?: string;
}

export default function ClusterList({
  displayId,
  drillDownDepth,
  filteredCountByCluster,
  onNavigateToCluster,
  className,
}: ClusterListProps) {
  const [clusterId] = useClusterId();

  const visibleClusters = useSignalStoreContext((state) => getVisibleClusters(state, displayId), shallow);
  const unclusteredCount = useSignalStoreContext(selectUnclusteredCount);
  const unclusteredVirtualCluster = useSignalStoreContext(getUnclusteredVirtualCluster);

  const showUnclustered = drillDownDepth === 0;

  return (
    <div className={cn("border-r bg-secondary overflow-y-auto overflow-x-hidden min-w-0", className)}>
      <div className="flex flex-col gap-0.5 py-2 px-2 min-w-0">
        {visibleClusters.length === 0 && !showUnclustered ? (
          <div className="text-muted-foreground text-sm py-4 text-center">No sub-clusters</div>
        ) : (
          <>
            {visibleClusters.map((cluster, index) => {
              const hasChildren = cluster.children.length > 0;
              const filteredCount = filteredCountByCluster.get(cluster.id);
              const iconVariant: IconVariant = hasChildren ? "boxes" : "box";
              return (
                <ClusterItem
                  key={cluster.id}
                  cluster={cluster}
                  iconVariant={iconVariant}
                  color={getClusterColor(index, drillDownDepth)}
                  isSelected={clusterId === cluster.id}
                  filteredCount={filteredCount}
                  onClick={() => onNavigateToCluster(cluster.id)}
                />
              );
            })}

            {showUnclustered && unclusteredCount > 0 && (
              <>
                {visibleClusters.length > 0 && <div className="border-t my-1" />}
                <ClusterItem
                  cluster={unclusteredVirtualCluster}
                  iconVariant="circle-dashed"
                  color={UNCLUSTERED_COLOR}
                  isSelected={clusterId === UNCLUSTERED_ID}
                  filteredCount={filteredCountByCluster.get(UNCLUSTERED_ID)}
                  onClick={() => onNavigateToCluster(UNCLUSTERED_ID)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
