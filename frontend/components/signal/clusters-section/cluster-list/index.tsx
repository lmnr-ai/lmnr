"use client";

import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { getClusterColor, UNCLUSTERED_COLOR } from "../colors";
import { type ClusterNode } from "../utils";
import ClusterItem, { type IconVariant } from "./cluster-item";

interface ClusterListProps {
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  visibleClusters: ClusterNode[];
  unclusteredCount: number;
  unclusteredVirtualCluster: ClusterNode;
  selectedClusterId: string | null;
  onNavigateToCluster: (clusterId: string) => void;
  className?: string;
}

export default function ClusterList({
  drillDownDepth,
  filteredCountByCluster,
  visibleClusters,
  unclusteredCount,
  unclusteredVirtualCluster,
  selectedClusterId,
  onNavigateToCluster,
  className,
}: ClusterListProps) {
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
              const iconVariant: IconVariant = hasChildren ? "folder" : "circle";
              return (
                <ClusterItem
                  key={cluster.id}
                  cluster={cluster}
                  iconVariant={iconVariant}
                  color={getClusterColor(index, drillDownDepth)}
                  isSelected={selectedClusterId === cluster.id}
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
                  isSelected={selectedClusterId === UNCLUSTERED_ID}
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
