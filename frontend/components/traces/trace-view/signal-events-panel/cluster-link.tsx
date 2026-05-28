"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowUpRight, Box } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getClusterColorById, withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

interface Props {
  signalName: string;
  clusterPath: TraceSignalClusterNode[];
  projectId: string;
  signalId: string;
  traceId: string;
  className?: string;
}

function ClusterCube({ id }: { id: string }) {
  const color = getClusterColorById(id);
  return (
    <Box
      className="size-3 shrink-0"
      fill={withOpacity(color, 0.1)}
      stroke={withOpacity(color, 0.7)}
      strokeWidth={1.5}
    />
  );
}

/** `[cube] [cluster name] [↗]` — opens the cluster in Signals. Hovering the
 *  cube reveals the full ancestor breadcrumb path. */
export default function ClusterLink({ signalName, clusterPath, projectId, signalId, traceId, className }: Props) {
  const leaf = clusterPath[clusterPath.length - 1];
  if (!leaf) return null;
  const href = `/project/${projectId}/signals/${signalId}?clusterId=${leaf.id}&traceId=${traceId}`;
  return (
    <Link
      href={href}
      target="_blank"
      className={cn(
        "group flex flex-1 items-center gap-1.5 min-w-0 text-xs text-foreground hover:text-foreground/80 font-medium",
        className
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex shrink-0">
            <ClusterCube id={leaf.id} />
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top" align="start">
            <div className="flex items-center gap-1 text-xs">
              <span>{signalName}</span>
              {clusterPath.map((node) => (
                <Fragment key={node.id}>
                  <span className="text-muted-foreground">/</span>
                  <ClusterCube id={node.id} />
                </Fragment>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{leaf.name}</span>
            <ArrowUpRight className="size-4 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top">Open cluster in Signals</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </Link>
  );
}
