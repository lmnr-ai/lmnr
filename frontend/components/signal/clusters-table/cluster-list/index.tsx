"use client";

import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { getClusterColor, UNCLUSTERED_COLOR } from "../colors";
import { type ClusterNode } from "../utils";
import ClusterItem, { type IconVariant } from "./cluster-item";

interface ClusterListProps {
  visibleClusters: ClusterNode[];
  selectedLeafId: string | null;
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  onNavigateToCluster: (clusterId: string) => void;
  onToggleLeafSelection: (clusterId: string) => void;
  unclusteredCount: number;
  unclusteredVirtualCluster: ClusterNode;
  className?: string;
}

export default function ClusterList({
  visibleClusters,
  selectedLeafId,
  drillDownDepth,
  filteredCountByCluster,
  onNavigateToCluster,
  onToggleLeafSelection,
  unclusteredCount,
  unclusteredVirtualCluster,
  className,
}: ClusterListProps) {
  const isUnclusteredSelected = selectedLeafId === UNCLUSTERED_ID;
  const showUnclustered = drillDownDepth === 0;

  return (
    <div className={cn("border-r bg-secondary overflow-y-auto overflow-x-hidden", className)}>
      <div className="flex flex-col gap-0.5 py-2 px-2">
        {visibleClusters.length === 0 && !showUnclustered ? (
          <div className="text-muted-foreground text-sm py-4 text-center">No sub-clusters</div>
        ) : (
          <>
            {visibleClusters.map((cluster, index) => {
              const hasChildren = cluster.children.length > 0;
              const isLeafSelected = !hasChildren && selectedLeafId === cluster.id;
              const filteredCount = filteredCountByCluster.get(cluster.id);
              const iconVariant: IconVariant = hasChildren ? "folder" : "circle";
              return (
                <ClusterItem
                  key={cluster.id}
                  cluster={cluster}
                  iconVariant={iconVariant}
                  color={getClusterColor(index, drillDownDepth)}
                  isSelected={isLeafSelected}
                  filteredCount={filteredCount}
                  onClick={() => {
                    if (hasChildren) {
                      onNavigateToCluster(cluster.id);
                    } else {
                      onToggleLeafSelection(cluster.id);
                    }
                  }}
                />
              );
            })}

            {showUnclustered && unclusteredCount > 0 && (
              <>
                {visibleClusters.length > 0 && <div className="border-t my-1" />}
                <ClusterItem
                  cluster={unclusteredVirtualCluster}
                  iconVariant={isUnclusteredSelected ? "circle" : "circle-dashed"}
                  color={UNCLUSTERED_COLOR}
                  isSelected={isUnclusteredSelected}
                  filteredCount={filteredCountByCluster.get(UNCLUSTERED_ID)}
                  onClick={() => onToggleLeafSelection(UNCLUSTERED_ID)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
