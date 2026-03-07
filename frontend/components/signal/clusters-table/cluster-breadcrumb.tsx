"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type EventCluster } from "@/lib/actions/clusters";

import { type ClusterNode } from "./utils";

interface ClusterBreadcrumbProps {
  breadcrumb: ClusterNode[];
  selectedLeafId: string | null;
  visibleClusters: EventCluster[];
  pathIds: string[];
  onNavigateToBreadcrumb: (index: number) => void;
  onClearLeafSelection: () => void;
}

export default function ClusterBreadcrumb({
  breadcrumb,
  selectedLeafId,
  visibleClusters,
  pathIds,
  onNavigateToBreadcrumb,
  onClearLeafSelection,
}: ClusterBreadcrumbProps) {
  return (
    <div className="flex items-center gap-1 text-sm min-w-0 pl-1">
      <button
        className={`hover:underline shrink-0 ${breadcrumb.length === 0 && !selectedLeafId ? "font-semibold text-secondary-foreground" : "text-muted-foreground"}`}
        onClick={() => onNavigateToBreadcrumb(-1)}
      >
        All Events
      </button>
      {breadcrumb.map((node, index) => {
        const isLast = index === breadcrumb.length - 1 && !selectedLeafId;
        return (
          <React.Fragment key={node.id}>
            <span className="text-muted-foreground shrink-0">/</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`hover:underline truncate min-w-0 flex-1 text-left ${
                    isLast ? "font-semibold text-secondary-foreground" : "text-muted-foreground"
                  }`}
                  onClick={() => onNavigateToBreadcrumb(pathIds.indexOf(node.id))}
                >
                  {node.name}
                </button>
              </TooltipTrigger>
              <TooltipPrimitive.Portal>
                <TooltipContent className="max-w-[250px]">
                  <p className="font-medium">{node.name}</p>
                  <p className="text-muted-foreground">{node.numEvents} total events</p>
                </TooltipContent>
              </TooltipPrimitive.Portal>
            </Tooltip>
          </React.Fragment>
        );
      })}
      {selectedLeafId &&
        (() => {
          const leafNode = visibleClusters.find((c) => c.id === selectedLeafId);
          if (!leafNode) return null;
          return (
            <>
              <span className="text-muted-foreground shrink-0">/</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="font-semibold text-secondary-foreground hover:underline truncate min-w-0 flex-1 text-left"
                    onClick={onClearLeafSelection}
                  >
                    {leafNode.name}
                  </button>
                </TooltipTrigger>
                <TooltipPrimitive.Portal>
                  <TooltipContent className="max-w-[250px]">
                    <p className="font-medium">{leafNode.name}</p>
                    <p className="text-muted-foreground">{leafNode.numEvents} total events</p>
                  </TooltipContent>
                </TooltipPrimitive.Portal>
              </Tooltip>
            </>
          );
        })()}
    </div>
  );
}
