// What the readout's subject breaks down into, ranked by size rather than by the
// strip's stack order: the strip is ordered so subtrees stay contiguous across the
// rows, which is the wrong question for a list. It scrolls, fading at both ends via
// `scroll-fade-y`, which ramps each edge's mask off the scroll position, so an
// edge only fades when there is really something past it. `auto-rows-min` so the
// rows keep their own height instead of stretching to fill the box.
"use client";

import { type CSSProperties } from "react";

import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { type ClusterNode } from "../model";
import ReadoutRow from "./readout-row";

interface Props {
  nodes: ClusterNode[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Picking from the card ends that interaction, so the card is dismissed too. */
  onPick: () => void;
  /** Events in the window that no cluster claimed. `undefined` omits the row —
   *  it is only offered from the root list, where "not in any of these" is a
   *  meaningful sibling of the clusters above it. */
  unclusteredCount?: number;
}

export default function ClusterChildList({ nodes, onSelect, onHover, onPick, unclusteredCount }: Props) {
  // Zero is not a pick: an empty bucket would filter the table to nothing.
  const showUnclustered = unclusteredCount !== undefined && unclusteredCount > 0;

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
        <ReadoutRow
          key={child.id}
          iconVariant={child.children.length > 0 ? "boxes" : "box"}
          color={child.color}
          name={child.name}
          total={child.total}
          onPick={() => {
            onPick();
            onSelect(child.id);
          }}
          onHover={(hovering) => onHover(hovering ? child.id : null)}
        />
      ))}

      {showUnclustered && (
        <>
          {/* Last and ruled off, not sorted in among the clusters: it is the
              leftover, so its position should not depend on how big it happens
              to be this window. */}
          <div className="col-span-2 my-0.5 border-t border-border/60" />
          <ReadoutRow
            iconVariant="circle-dashed"
            color={UNCLUSTERED_COLOR}
            name="Unclustered Events"
            total={unclusteredCount}
            onPick={() => {
              onPick();
              onSelect(UNCLUSTERED_ID);
            }}
            // Hovering it mutes every band, which is the honest answer: none of
            // them holds these events.
            onHover={(hovering) => onHover(hovering ? UNCLUSTERED_ID : null)}
          />
        </>
      )}
    </div>
  );
}
