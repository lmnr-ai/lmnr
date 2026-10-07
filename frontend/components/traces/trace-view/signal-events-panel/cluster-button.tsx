"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getClusterColorById } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { CHIP, CHIP_ARROW, CHIP_SURFACE, CHIP_SURFACE_STATIC, TOOLTIP_DELAY_MS } from "./constants";

interface Props {
  cluster: TraceSignalClusterNode;
  /** Omitted on a public shared trace: the membership is worth showing, but the
   *  signal page behind it needs a project the viewer may not have. */
  href?: string;
  /** Truncate when the row runs out instead of overflowing it. Grow stays 0, so a
   *  lone cluster sizes to its label rather than stretching across the panel. */
  shrinkable?: boolean;
}

/** Links an event into the signal page, scoped to the cluster and the event — so
 *  it replaces "Open in Signals" rather than sitting beside it. Without an `href`
 *  it degrades to a plain label that still names the cluster. */
export default function ClusterButton({ cluster, href, shrinkable }: Props) {
  const shape = cn("min-w-0 overflow-hidden px-1.5 text-left", shrinkable ? "shrink" : "shrink-0");
  const content = (
    <>
      {/* Never shrinks, so a squeezed button loses the label rather than its identity. */}
      <ClusterIcon iconVariant="box" color={getClusterColorById(cluster.id)} />
      <span className="min-w-0 truncate">{cluster.name}</span>
      {href && <ArrowUpRight className={CHIP_ARROW} />}
    </>
  );

  const button = href ? (
    <Link href={href} target="_blank" className={cn(CHIP, CHIP_SURFACE, shape)}>
      {content}
    </Link>
  ) : (
    <span className={cn(CHIP, CHIP_SURFACE_STATIC, shape)}>{content}</span>
  );

  // Portalled because the panel root is `overflow-hidden` and would clip it.
  return (
    <Tooltip delayDuration={TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom">{cluster.name}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
