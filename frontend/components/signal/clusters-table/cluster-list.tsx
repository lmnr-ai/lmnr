"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventCluster } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { getClusterColor } from "./colors";
import { type ClusterNode } from "./utils";

interface ClusterListProps {
  visibleClusters: EventCluster[];
  selectedLeafId: string | null;
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  slideClass: string;
  onNavigateToCluster: (clusterId: string) => void;
  onToggleLeafSelection: (clusterId: string) => void;
}

export default function ClusterList({
  visibleClusters,
  selectedLeafId,
  drillDownDepth,
  filteredCountByCluster,
  slideClass,
  onNavigateToCluster,
  onToggleLeafSelection,
}: ClusterListProps) {
  return (
    <div className="min-w-[200px] max-w-[280px] border-r bg-muted/60 overflow-y-auto">
      <div className={cn("flex flex-col gap-0.5 py-2 px-3 transition-all ease-out", slideClass)}>
        {visibleClusters.length === 0 ? (
          <div className="text-muted-foreground text-sm py-4 text-center">No sub-clusters</div>
        ) : (
          visibleClusters.map((cluster, index) => {
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
                      isLeafSelected && "bg-primary/10 font-medium relative"
                    )}
                    onClick={() => {
                      if (hasChildren) {
                        onNavigateToCluster(cluster.id);
                      } else {
                        onToggleLeafSelection(cluster.id);
                      }
                    }}
                  >
                    {isLeafSelected && (
                      <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary" />
                    )}
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getClusterColor(index, drillDownDepth) }}
                    />
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
          })
        )}
      </div>
    </div>
  );
}
