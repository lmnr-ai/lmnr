"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import ClusterIcon from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getClusterColorById } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

/** Long enough that crossing a button on the way somewhere else does not summon
 *  anything. The app-wide provider is 0ms, which is right for an icon button and
 *  wrong for a row of them. */
export const TOOLTIP_DELAY_MS = 300;

/** Height, radius, inset, gap and label size, shared by the three chips in the
 *  panel so they read as one object doing three jobs rather than three chip
 *  designs in one card. */
const CHIP = "flex h-5.5 items-center gap-1.25 rounded-2xl text-[11px] font-medium";

const ARROW = "size-[13px] shrink-0 opacity-60";

/**
 * The link from an event to a cluster it landed in — and, when an event has been
 * clustered, its only way out of the trace: this is strictly more than "Open in
 * Signals" gives you, being scoped to the cluster and the event as well as the
 * signal.
 *
 * `shrinkable` gives up width and truncates when the row runs out, instead of
 * overflowing it. Grow stays at 0 — a lone cluster sizes to its label rather
 * than stretching across the panel.
 */
export default function ClusterButton({
  cluster,
  href,
  shrinkable,
}: {
  cluster: TraceSignalClusterNode;
  href: string;
  shrinkable?: boolean;
}) {
  const button = (
    <Link
      href={href}
      target="_blank"
      className={cn(
        CHIP,
        "min-w-0 overflow-hidden px-1.5 text-left transition-colors",
        "bg-signal/14 hover:bg-signal/24",
        shrinkable ? "shrink" : "shrink-0"
      )}
    >
      {/* The mark never shrinks, so a squeezed button loses the label rather than
          its identity. */}
      <ClusterIcon iconVariant="box" color={getClusterColorById(cluster.id)} />
      <span className="min-w-0 truncate">{cluster.name}</span>
      <ArrowUpRight className={ARROW} />
    </Link>
  );

  // The label truncates, and a cluster name is a phrase — three or four on one
  // row and each is down to a few words. Portalled because the panel root is
  // `overflow-hidden` and would otherwise clip it.
  return (
    <Tooltip delayDuration={TOOLTIP_DELAY_MS}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom">{cluster.name}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/**
 * "Open in Signals" — the way out of the trace when the event has no cluster to
 * carry one. It sits where a cluster button would sit, so it is the same size as
 * one; what it does not take is a cluster colour, because it stands for no
 * cluster.
 *
 * A cluster button opens with an icon, which stands its label off the left edge.
 * This one opens with the text, so the same inset reads tighter — 2px back on
 * the left only.
 */
export function OpenInSignalsButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className={cn(
        CHIP,
        "min-w-0 shrink-0 overflow-hidden pr-1.5 pl-2 transition-colors bg-signal/14 hover:bg-signal/24"
      )}
    >
      <span className="min-w-0 truncate">Open in Signals</span>
      <ArrowUpRight className={ARROW} />
    </Link>
  );
}

/**
 * An enum value from the payload — `category: "logic_error"`, and the like.
 *
 * No icon and no arrow: it is a value, not a link, and the arrow is what marks
 * the other two as a way out of the trace. Its inset is wider than a button's
 * because an enum is bare text against a rounded edge, where a button's glyphs
 * already stand its label off the ends — same optical space, two numbers.
 */
export function EnumPill({ value }: { value: string }) {
  return <span className={cn(CHIP, "inline-flex px-2.5 text-secondary-foreground bg-signal/14")}>{value}</span>;
}
