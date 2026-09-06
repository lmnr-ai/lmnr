// The readout's trigger header: icon, title, chevron, facts. Rendered twice —
// once as the trigger and once inside the card, which is what keeps the title in
// place as the card opens.
//
// Takes already-derived display values rather than a ClusterNode: the readout has
// three subjects (a cluster, the unclustered bucket, and the root list) and only
// one of them is a node.
"use client";

import { ChevronDown } from "lucide-react";

import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-icon";
import { cn } from "@/lib/utils";

import { ClusterFacts } from "../cluster-icicle/band-details";

interface Props {
  iconVariant: IconVariant;
  color: string;
  title: string;
  /** Empty renders no caption row at all — the root list has no facts to state. */
  facts: string[];
  expandable: boolean;
  open: boolean;
}

export default function ClusterReadoutHeader({ iconVariant, color, title, facts, expandable, open }: Props) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1">
      {/* Same icon vocabulary as the breadcrumb trail: a stack of boxes for
          something that breaks down further, a single box for a leaf. */}
      <ClusterIcon iconVariant={iconVariant} color={color} />
      <span className="flex min-w-0 items-center gap-1">
        {/* One step up from the `text-xs` the rest of the readout inherits, so the
            title reads as the heading and the facts under it as the caption. It
            matches the breadcrumb trail directly above it. */}
        <span className="max-w-[420px] truncate text-sm font-medium">{title}</span>
        {expandable && (
          // ONE icon, rotated, not two swapped: a swap cannot be animated, and the
          // whole job of this glyph is to say the header does something.
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        )}
      </span>
      {/* The same facts the strip's tooltip gives, so the two readouts never
          disagree. */}
      {facts.length > 0 && (
        <div className="col-start-2 flex flex-col gap-1">
          <ClusterFacts facts={facts} />
        </div>
      )}
    </div>
  );
}
