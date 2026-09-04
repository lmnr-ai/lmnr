// The readout pinned in the chart's top-left corner: which cluster is in play,
// the facts about it, and — behind a hover card — what it breaks down into.
//
// It exists because the strip took the cluster list's place, and with the list
// gone nothing else on the card names what is currently selected.
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { type ClusterNode } from "../model";
import ClusterChildList from "./child-list";
import ClusterReadoutHeader from "./header";
import ClusterReadoutScrim from "./scrim";
import { useHoverCard } from "./use-hover-card";

export function findNode(nodes: ClusterNode[], id: string): ClusterNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

// The card's own padding, which the header underneath does not have. Backing the
// card off by exactly this keeps the name in the SAME PLACE as it opens — the
// card grows around the text rather than replacing it somewhere else.
const CARD_PAD_X = 8;
const CARD_PAD_Y = 6;

interface Props {
  /** The cluster forest, roots at the coarsest level. */
  tree: ClusterNode[];
  hasChildren: Set<string>;
  /** The pinned cluster. `null` renders nothing at all. */
  clusterId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  className?: string;
}

export default function ClusterReadout({ tree, hasChildren, clusterId, onSelect, onHover, className }: Props) {
  const { rect, headerRef, cardRef, clearTimers, scheduleOpen, scheduleClose, closeNow } = useHoverCard();

  const node = clusterId ? findNode(tree, clusterId) : null;
  // Hooks are all above this line — the readout renders nothing when no cluster
  // is pinned, and that must not change the hook order.
  if (!node) return null;

  // Roots only: a parent's rolled-up total already contains its children's.
  const grandTotal = tree.reduce((sum, n) => sum + n.total, 0);
  const children = [...node.children].sort((a, b) => b.total - a.total);
  // No chevron on a leaf: the affordance has to promise something that is
  // actually there.
  const expandable = children.length > 0;
  const open = expandable && rect !== null;

  const header = (
    <ClusterReadoutHeader
      node={node}
      hasChildren={hasChildren}
      grandTotal={grandTotal}
      expandable={expandable}
      open={open}
    />
  );

  return (
    <div
      className={cn(
        "absolute left-3 top-3 z-10 flex flex-col items-start gap-2 text-xs leading-tight",
        // Only the header is meant to take the pointer; the block itself must not
        // swallow clicks on the chart beneath.
        "pointer-events-none",
        className
      )}
    >
      <ClusterReadoutScrim />

      <div
        ref={headerRef}
        // The trigger has to take the pointer back off the root's
        // `pointer-events-none`.
        className={cn(expandable && "pointer-events-auto cursor-default")}
        onPointerEnter={expandable ? scheduleOpen : undefined}
        onPointerLeave={expandable ? scheduleClose : undefined}
        // Any wheel means the reader is going somewhere else, and the card is
        // position-fixed — it would hang in the air over whatever scrolled past.
        onWheel={expandable ? closeNow : undefined}
      >
        {header}
      </div>

      {/* Portalled to the body rather than drawn here: the chart pane clips its
          overflow, and a card long enough to be worth opening is taller than the
          pane. Fixed positioning then has to be backed off by the card's own
          padding so the header underneath stays exactly where it was. */}
      {expandable &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {rect && (
              <motion.div
                ref={cardRef}
                className="pointer-events-auto fixed z-50 flex flex-col gap-2 rounded-md border bg-secondary px-2 py-1.5 text-xs leading-tight shadow-md shadow-background/80"
                style={{
                  top: rect.top - CARD_PAD_Y,
                  left: rect.left - CARD_PAD_X,
                  minWidth: rect.width + 2 * CARD_PAD_X,
                }}
                // Fades rather than scales or slides: it stands in for text already
                // on screen in that exact spot, so any movement reads as the name
                // jumping.
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.12, ease: "easeOut" } }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeOut" } }}
                onPointerEnter={clearTimers}
                onPointerLeave={scheduleClose}
                onWheel={(e) => e.stopPropagation()}
              >
                {header}
                <ClusterChildList nodes={children} onSelect={onSelect} onHover={onHover} onPick={closeNow} />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
