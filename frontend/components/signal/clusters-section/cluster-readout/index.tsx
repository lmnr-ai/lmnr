// The readout pinned in the chart's top-left corner: what the section is focused
// on, the facts about it, and — behind a hover card — what it breaks down into.
//
// It exists because the strip took the cluster list's place, and with the list
// gone nothing else on the card names what is currently selected. It has three
// subjects, and is never absent: a cluster, the unclustered bucket, or — with
// nothing pinned — the root list, which is the only route to either of the other
// two for a cluster the strip folded away or a bucket it cannot draw at all.
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";

import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { clusterFacts } from "../cluster-icicle/band-details";
import { type ClusterNode } from "../model";
import ClusterChildList from "./child-list";
import ClusterReadoutHeader from "./header";
import ClusterReadoutScrim from "./scrim";
import { useHoverCard } from "./use-hover-card";

/** Every cluster in the window, at every level — not just the roots the card
 *  lists. The list is a way in, so it shows what you can pick from here; the
 *  title says how much there is. */
function countNodes(nodes: ClusterNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

function findNode(nodes: ClusterNode[], id: string): ClusterNode | null {
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

// The root header stands for the whole forest rather than any one cluster, so it
// borrows the list's own colour instead of claiming a cluster's identity.
const ROOT_COLOR = "var(--color-muted-foreground)";

interface Props {
  /** The cluster forest, roots at the coarsest level. */
  tree: ClusterNode[];
  hasChildren: Set<string>;
  /** The pinned cluster, `UNCLUSTERED_ID`, or `null` for the root list. */
  clusterId: string | null;
  /** Events in the window no cluster claimed. */
  unclusteredCount: number;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  className?: string;
}

export default function ClusterReadout({
  tree,
  hasChildren,
  clusterId,
  unclusteredCount,
  onSelect,
  onHover,
  className,
}: Props) {
  const { rect, headerRef, cardRef, clearTimers, scheduleOpen, scheduleClose, closeNow } = useHoverCard();

  const node = clusterId && clusterId !== UNCLUSTERED_ID ? findNode(tree, clusterId) : null;
  // A pinned id the model does not know — a cluster that aged out of the window,
  // or a stale bookmark. Falling back to the root list keeps the readout present
  // and gives the reader somewhere to go.
  const isRoot = !clusterId || (clusterId !== UNCLUSTERED_ID && !node);
  const isUnclustered = clusterId === UNCLUSTERED_ID;

  // The list under the header. Roots are already "every cluster with no parent,
  // whatever its level" — `buildTree` re-hangs orphans as roots — so no filtering
  // is needed here, only the list's own biggest-first order.
  const children = isRoot
    ? [...tree].sort((a, b) => b.total - a.total)
    : node
      ? [...node.children].sort((a, b) => b.total - a.total)
      : [];

  // Only the root list offers it: from inside a cluster, "unclustered" is not one
  // of the things that cluster breaks down into.
  const listUnclusteredCount = isRoot ? unclusteredCount : undefined;

  const totalClusters = isRoot ? countNodes(tree) : 0;

  // No chevron on a leaf: the affordance has to promise something that is
  // actually there.
  const expandable = children.length > 0 || (listUnclusteredCount ?? 0) > 0;
  const open = expandable && rect !== null;

  const header = isRoot ? (
    <ClusterReadoutHeader
      // Not a cluster, but the list it opens is nothing but clusters, and the
      // glyph is what ties the header to them.
      iconVariant="boxes"
      color={ROOT_COLOR}
      title={`${totalClusters.toLocaleString()} ${totalClusters === 1 ? "Cluster" : "Clusters"}`}
      // Nothing is pinned, so there is no subject for a fact to be about.
      facts={[]}
      expandable={expandable}
      open={open}
    />
  ) : isUnclustered ? (
    <ClusterReadoutHeader
      iconVariant="circle-dashed"
      color={UNCLUSTERED_COLOR}
      title="Unclustered Events"
      // Count only: "unclustered" is the leftover, not a thing whose prevalence
      // anyone is sizing up against the traces that were looked at.
      facts={[`${unclusteredCount.toLocaleString()} events`]}
      expandable={false}
      open={false}
    />
  ) : (
    <ClusterReadoutHeader
      iconVariant={hasChildren.has(node!.id) ? "boxes" : "box"}
      color={node!.color}
      title={node!.name}
      facts={clusterFacts(node!)}
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
                <ClusterChildList
                  nodes={children}
                  onSelect={onSelect}
                  onHover={onHover}
                  onPick={closeNow}
                  unclusteredCount={listUnclusteredCount}
                />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
