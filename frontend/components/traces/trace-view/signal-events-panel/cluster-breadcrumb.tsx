"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Box } from "lucide-react";

import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getClusterColorById, withOpacity } from "@/lib/clusters/colors";

interface Props {
  clusterPath: TraceSignalClusterNode[];
}

function ClusterCube({ id, name }: { id: string; name: string }) {
  const color = getClusterColorById(id);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Box
            className="size-3 shrink-0"
            fill={withOpacity(color, 0.1)}
            stroke={withOpacity(color, 0.7)}
            strokeWidth={1.5}
            aria-label={name}
          />
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top">{name}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * `▢ / ▢ / ▢ Leaf Cluster Name`
 *
 * Each ancestor is a small cube icon (matching cluster-list/cluster-item.tsx)
 * colored by id. The leaf gets its own cube + name. No signal name — that's
 * on the tab.
 */
export default function ClusterBreadcrumb({ clusterPath }: Props) {
  if (clusterPath.length === 0) return null;
  const leaf = clusterPath[clusterPath.length - 1];
  const ancestors = clusterPath.slice(0, -1);

  return (
    <div className="flex items-center gap-1 min-w-0 text-xs">
      {ancestors.map((node) => (
        <span key={node.id} className="flex items-center gap-1 shrink-0">
          <ClusterCube id={node.id} name={node.name} />
          <span className="text-secondary-foreground">/</span>
        </span>
      ))}
      {leaf && (
        <>
          <ClusterCube id={leaf.id} name={leaf.name} />
          <span className="text-foreground truncate">{leaf.name}</span>
        </>
      )}
    </div>
  );
}
