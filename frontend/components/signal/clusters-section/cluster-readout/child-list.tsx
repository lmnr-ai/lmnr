// What this cluster breaks down into, ranked by size rather than by the strip's
// stack order: the strip is ordered so subtrees stay contiguous across the rows,
// which is the wrong question for a list. It scrolls, fading at both ends via
// `scroll-fade-y`, which ramps each edge's mask off the scroll position, so an
// edge only fades when there is really something past it. `auto-rows-min` so the
// rows keep their own height instead of stretching to fill the box.
"use client";

import { type CSSProperties } from "react";

import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { cn } from "@/lib/utils";

import { type ClusterNode } from "../model";

interface Props {
  nodes: ClusterNode[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Picking from the card ends that interaction, so the card is dismissed too. */
  onPick: () => void;
}

export default function ClusterChildList({ nodes, onSelect, onHover, onPick }: Props) {
  return (
    <div
      className={cn(
        "pointer-events-auto grid min-h-0 auto-rows-min scroll-fade-y scrollbar-none grid-cols-[auto_1fr]",
        "max-h-[min(60vh,420px)] items-center gap-x-1.5 gap-y-1 overflow-y-auto"
      )}
      // The utility's own default is 2rem, which on 16px rows eats most of the
      // first and last one.
      style={{ "--scroll-fade-size": "12px" } as CSSProperties}
    >
      {nodes.map((child) => (
        // The whole row is one button, spanning both columns as a subgrid so its
        // icon and name still sit on the list's own tracks. The pointer-up is
        // stopped as well as handled: the chart pane reads a bare pointer-up as
        // "clicked empty space, drop the selection", which would undo the pick on
        // the way out.
        <button
          key={child.id}
          type="button"
          className="col-span-2 grid grid-cols-subgrid items-center text-left text-muted-foreground transition-colors hover:text-foreground"
          onPointerUp={(e) => {
            e.stopPropagation();
            onPick();
            onSelect(child.id);
          }}
          onPointerEnter={() => onHover(child.id)}
          onPointerLeave={() => onHover(null)}
        >
          <ClusterIcon
            iconVariant={child.children.length > 0 ? "boxes" : "box"}
            color={child.color}
            iconClassName={child.children.length > 0 ? "size-4" : undefined}
          />
          <span className="flex min-w-0 items-center">
            {/* `flex-1`: without it the name hugs its text, so a short one drags
                the count in beside it and the column of numbers goes ragged. */}
            <span className="min-w-0 max-w-[320px] flex-1 truncate">{child.name}</span>
            {/* Fixed width and right-aligned, not just pushed to the end: with
                every name truncating at its cap the counts all START in the same
                place, so left-aligned they end wherever their digit count says. */}
            <span className="ml-2 min-w-[38px] shrink-0 text-right tabular-nums opacity-60">
              {child.total.toLocaleString()}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
