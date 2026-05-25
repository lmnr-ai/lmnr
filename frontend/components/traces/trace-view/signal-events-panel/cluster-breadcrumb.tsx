"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Box, Radio } from "lucide-react";
import { Fragment } from "react";

import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getClusterColorById, withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

interface Props {
  clusterPath: TraceSignalClusterNode[];
  signalName?: string;
  className?: string;
}

function ClusterCube({ id, name }: { id: string; name: string }) {
  const color = getClusterColorById(id);
  return (
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
  );
}

const Sep = () => <span className="text-secondary-foreground">/</span>;

/**
 * `📻 / ▢ / ▢ / ▢ Leaf Cluster Name`
 *
 * Leading Radio icon represents the signal itself; subsequent crumbs are the
 * cluster ancestor chain. When `clusterPath` is empty the breadcrumb still
 * renders as a single Radio icon so the header has a consistent leading mark.
 */
export default function ClusterBreadcrumb({ clusterPath, signalName, className }: Props) {
  const leaf = clusterPath[clusterPath.length - 1];
  const ancestors = clusterPath.slice(0, -1);

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex flex-1 items-center gap-1 min-w-0 text-xs", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Radio className="size-3 shrink-0 text-muted-foreground" aria-label={signalName ?? "Signal"} />
          </TooltipTrigger>
          {signalName && (
            <TooltipPortal>
              <TooltipContent side="top">{signalName}</TooltipContent>
            </TooltipPortal>
          )}
        </Tooltip>
        {ancestors.map((node) => (
          <Fragment key={node.id}>
            <Sep />
            <ClusterCube id={node.id} name={node.name} />
          </Fragment>
        ))}
        {leaf && (
          <>
            <Sep />
            <ClusterCube id={leaf.id} name={leaf.name} />
            <span className="text-foreground truncate">{leaf.name}</span>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
