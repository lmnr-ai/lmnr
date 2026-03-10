"use client";

import { Circle, CircleDashed } from "lucide-react";

import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { type ClusterNode } from "../utils";
import ClusterItem from "./cluster-item";

interface ClusterListProps {
  visibleClusters: EventCluster[];
  selectedLeafId: string | null;
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  onNavigateToCluster: (clusterId: string) => void;
  onToggleLeafSelection: (clusterId: string) => void;
  unclusteredCount: number;
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
              const hasChildren = (cluster as ClusterNode).children.length > 0;
              const isLeafSelected = !hasChildren && selectedLeafId === cluster.id;
              const filteredCount = filteredCountByCluster.get(cluster.id);
              return (
                <ClusterItem
                  key={cluster.id}
                  cluster={cluster}
                  index={index}
                  drillDownDepth={drillDownDepth}
                  isLeafSelected={isLeafSelected}
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

            {showUnclustered && (
              <>
                {visibleClusters.length > 0 && <div className="border-t my-1" />}
                <button
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors cursor-pointer hover:bg-muted text-secondary-foreground",
                    isUnclusteredSelected && "bg-sidebar-accent font-medium text-primary-foreground"
                  )}
                  onClick={() => onToggleLeafSelection(UNCLUSTERED_ID)}
                >
                  {isUnclusteredSelected ? (
                    <Circle className={cn("size-3.5 shrink-0 fill-slate-400 stroke-none")} />
                  ) : (
                    <CircleDashed className={cn("size-3.5 shrink-0 text-slate-400")} />
                  )}
                  <span className="truncate">Unclustered Events</span>
                  <span className="text-muted-foreground text-xs ml-auto shrink-0">{unclusteredCount}</span>
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
