"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Circle, CircleDashed, Folder } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { getClusterColor, withOpacity } from "./colors";
import { type ClusterNode } from "./utils";

interface ClusterListProps {
  visibleClusters: EventCluster[];
  selectedLeafId: string | null;
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  slideClass: string;
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
  slideClass,
  onNavigateToCluster,
  onToggleLeafSelection,
  unclusteredCount,
  className,
}: ClusterListProps) {
  const isUnclusteredSelected = selectedLeafId === UNCLUSTERED_ID;
  const showUnclustered = drillDownDepth === 0;

  return (
    <div className={cn("border-r bg-secondary overflow-y-auto", className)}>
      <div className={cn("flex flex-col gap-0.5 py-2 px-2 transition-all ease-out", slideClass)}>
        {visibleClusters.length === 0 && !showUnclustered ? (
          <div className="text-muted-foreground text-sm py-4 text-center">No sub-clusters</div>
        ) : (
          <>
            {visibleClusters.map((cluster, index) => {
              const hasChildren = (cluster as ClusterNode).children.length > 0;
              const isLeafSelected = !hasChildren && selectedLeafId === cluster.id;
              const filteredCount = filteredCountByCluster.get(cluster.id);
              const displayCount = filteredCount ?? cluster.numEvents;
              return (
                <Tooltip key={cluster.id}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors cursor-pointer hover:bg-muted",
                        isLeafSelected && "bg-sidebar-accent font-medium"
                      )}
                      onClick={() => {
                        if (hasChildren) {
                          onNavigateToCluster(cluster.id);
                        } else {
                          onToggleLeafSelection(cluster.id);
                        }
                      }}
                    >
                      {hasChildren ? (
                        <Folder
                          className="w-4 h-4 shrink-0"
                          fill={withOpacity(getClusterColor(index, drillDownDepth), 0.25)}
                          stroke={getClusterColor(index, drillDownDepth)}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <Circle
                          fill={
                            isLeafSelected
                              ? getClusterColor(index, drillDownDepth)
                              : withOpacity(getClusterColor(index, drillDownDepth), 0.25)
                          }
                          stroke={getClusterColor(index, drillDownDepth)}
                          className="size-3.5 rounded-full shrink-0"
                        />
                      )}
                      <span className="truncate">{cluster.name}</span>
                      <span className="text-muted-foreground text-xs ml-auto shrink-0">{displayCount}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent side="right" className="max-w-[250px]">
                      <p className="font-medium">{cluster.name}</p>
                      <p className="text-muted-foreground">{cluster.numEvents} total events</p>
                      {filteredCount !== undefined && filteredCount !== cluster.numEvents && (
                        <p className="text-muted-foreground">{filteredCount} in selected range</p>
                      )}
                      {hasChildren && (
                        <p className="text-muted-foreground">{(cluster as ClusterNode).children.length} sub-clusters</p>
                      )}
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              );
            })}

            {showUnclustered && (
              <>
                {visibleClusters.length > 0 && <div className="border-t my-1" />}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors cursor-pointer hover:bg-muted",
                        isUnclusteredSelected && "bg-sidebar-accent font-medium"
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
                  </TooltipTrigger>
                  <TooltipPrimitive.Portal>
                    <TooltipContent side="right" className="max-w-[250px]">
                      <p className="font-medium">Unclustered Events</p>
                      <p className="text-muted-foreground">{unclusteredCount} events</p>
                    </TooltipContent>
                  </TooltipPrimitive.Portal>
                </Tooltip>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
