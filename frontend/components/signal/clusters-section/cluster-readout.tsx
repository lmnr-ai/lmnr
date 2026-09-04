// The readout pinned in the chart's top-left corner: which cluster is in play,
// the facts about it, and — behind a hover card — what it breaks down into.
//
// It exists because the strip took the cluster list's place, and with the list
// gone nothing else on the card names what is currently selected.
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { cn } from "@/lib/utils";

import { ClusterFacts, clusterFacts } from "./cluster-icicle/band-details";
import { type ClusterNode } from "./model";

export function findNode(nodes: ClusterNode[], id: string): ClusterNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

// Long enough that crossing the header on the way somewhere else does not open
// it, short enough that aiming at it feels direct.
const OPEN_DELAY_MS = 220;
// Deferred close, so the few pixels between the header and the card's own edge
// are not a gap the pointer can fall through.
const CLOSE_DELAY_MS = 80;
// The card's own padding, which the header underneath does not have. Backing the
// card off by exactly this keeps the name in the SAME PLACE as it opens — the
// card grows around the text rather than replacing it somewhere else.
const CARD_PAD_X = 8;
const CARD_PAD_Y = 6;

// Two masks composited with `intersect`, so alpha is the min of a bottom ramp and
// a right ramp: each inner edge fades on its own and the corner falls out of both.
// A single 135° gradient would instead fade the top-left, which is where the words
// are.
const SCRIM_MASK =
  "linear-gradient(to bottom, #000 60%, transparent), linear-gradient(to right, #000 62%, transparent)";

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

interface Rect {
  top: number;
  left: number;
  width: number;
}

export default function ClusterReadout({ tree, hasChildren, clusterId, onSelect, onHover, className }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  // The rect is measured when the timer FIRES, not on enter: the card is
  // position-fixed, so a rect captured before the page settled would pin it to
  // where the header used to be.
  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => {
      const el = headerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width });
    }, OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setRect(null), CLOSE_DELAY_MS);
  }, [clearTimers]);

  const closeNow = useCallback(() => {
    clearTimers();
    setRect(null);
  }, [clearTimers]);

  // The card is position-fixed against a rect captured when it opened, so
  // anything that moves the trigger strands it. Capture phase, because the page
  // scroller is an ancestor and scroll does not bubble.
  useEffect(() => {
    if (rect === null) return;
    window.addEventListener("scroll", closeNow, true);
    window.addEventListener("resize", closeNow);
    return () => {
      window.removeEventListener("scroll", closeNow, true);
      window.removeEventListener("resize", closeNow);
    };
  }, [rect, closeNow]);

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
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1">
      {/* Same icon vocabulary as the breadcrumb trail: a stack of boxes for
          something that breaks down further, a single box for a leaf. */}
      <ClusterIcon iconVariant={hasChildren.has(node.id) ? "boxes" : "box"} color={node.color} />
      <span className="flex min-w-0 items-center gap-1">
        {/* One step up from the `text-xs` the rest of the readout inherits, so the
            name reads as the heading and the facts under it as the caption. It
            matches the breadcrumb trail directly above it. */}
        <span className="max-w-[420px] truncate text-sm font-medium">{node.name}</span>
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
      <div className="col-start-2 flex flex-col gap-1">
        <ClusterFacts facts={clusterFacts(node, grandTotal)} />
      </div>
    </div>
  );

  // What this cluster breaks down into, ranked by size rather than by the strip's
  // stack order: the strip is ordered so subtrees stay contiguous across the
  // rows, which is the wrong question for a list. It scrolls, fading at both ends
  // via `scroll-fade-y`, which ramps each edge's mask off the scroll position, so
  // an edge only fades when there is really something past it. `auto-rows-min` so
  // the rows keep their own height instead of stretching to fill the box.
  const list = (
    <div
      className={cn(
        "pointer-events-auto grid min-h-0 auto-rows-min scroll-fade-y scrollbar-none grid-cols-[auto_1fr]",
        "max-h-[min(60vh,420px)] items-center gap-x-1.5 gap-y-1 overflow-y-auto"
      )}
      // The utility's own default is 2rem, which on 16px rows eats most of the
      // first and last one.
      style={{ "--scroll-fade-size": "12px" } as CSSProperties}
    >
      {children.map((child) => (
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
            // Picking from the card is the end of that interaction — leaving it
            // open over a cluster it is no longer about reads as a bug.
            closeNow();
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
      {/* Opaque page fill, faded out rather than clipped: a hard-edged box over
          the chart reads as a panel on top, while masking the two INNER edges
          makes the same fill read as the chart being cut away behind the text.
          `-left-3 -top-3` lands exactly on the pane corner given `left-3 top-3`. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-3 -right-20 -top-3 -z-10 bg-background"
        style={{
          maskImage: SCRIM_MASK,
          maskComposite: "intersect",
          WebkitMaskImage: SCRIM_MASK,
          WebkitMaskComposite: "source-in",
        }}
      />

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
                {list}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
