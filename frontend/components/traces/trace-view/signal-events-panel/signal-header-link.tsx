"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowUpRight, Radio } from "lucide-react";
import Link from "next/link";

import ClusterIcon from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { type TraceSignal, type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  signal: TraceSignal;
  leafCluster: TraceSignalClusterNode | null | undefined;
  projectId: string;
  traceId: string;
  compact?: boolean;
}

/**
 * The header link in the signal-events panel, opening in Signals in a new tab.
 * When the signal belongs to a leaf cluster it deep-links to that cluster (cube
 * icon, `[cube] [cluster name] [↗]`); otherwise it links to the signal itself
 * (radio icon, `[radio] [signal name] [↗]`).
 */
export default function SignalHeaderLink({ signal, leafCluster, projectId, traceId, compact }: Props) {
  const href = leafCluster
    ? `/project/${projectId}/signals/${signal.signalId}?clusterId=${leafCluster.id}&traceId=${traceId}`
    : `/project/${projectId}/signals/${signal.signalId}?traceId=${traceId}`;

  const label = leafCluster ? leafCluster.name : signal.signalName;
  const tooltip = leafCluster ? "Open cluster in Signals" : "Open in Signals";

  return (
    <Link
      href={href}
      target="_blank"
      className={cn(
        "group flex items-center gap-1.5 min-w-0 pl-1 font-medium hover:text-foreground/80",
        leafCluster ? "flex-1 text-xs text-foreground" : compact ? "text-xs" : "text-sm"
      )}
    >
      <span className="flex shrink-0">
        {leafCluster ? <ClusterIcon iconVariant="box" color="#E8E3E3" /> : <Radio className="size-4 shrink-0" />}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{label}</span>
            <ArrowUpRight className="size-3.5 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </Link>
  );
}
