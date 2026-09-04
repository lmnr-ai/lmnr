// The cluster forest as an icicle strip: depth runs top-to-bottom (coarsest
// first) and a band's width is proportional to its event count.
//
// Hovering a band focuses that cluster across the section; clicking pins it.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { type ClusterNode } from "../model";
import BandDetails from "./band-details";
import { BAND } from "./constants";
import ExtraList from "./extra-list";
import { buildView, finestLevel, type ViewNode } from "./fold";
import IcicleNode from "./node";

/** Milliseconds the tooltip stays up after the pointer leaves a band. Reaching
 *  the extra-clusters list means crossing the tooltip's own offset, and a
 *  straight close on pointer-leave would shut it on the way there. */
const TIP_CLOSE_DELAY_MS = 120;

interface Props {
  tree: ClusterNode[];
  /** Cluster pinned by a click. */
  selectedId: string | null;
  hoveredId: string | null;
  /** id → its ancestors, so a node can tell whether it is under the focus. */
  ancestors: Map<string, Set<string>>;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  className?: string;
}

export default function ClusterIcicle({ tree, selectedId, hoveredId, ancestors, onHover, onSelect, className }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);
  // The strip owns ONE tooltip, not one per band. A band's own bottom edge is the
  // wrong place to hang it: inside an open panel that edge is in the middle of
  // the panel, so the tooltip lands on top of the rows below it. The strip's
  // bottom edge is below everything, always, and it does not move — the strip
  // reserves its bottom padding permanently, so focusing a cluster changes no
  // heights. All the tooltip borrows from the band is its left edge.
  const [tip, setTip] = useState<{ node: ViewNode; left: number } | null>(null);

  // What decides whether a band is worth drawing is how many pixels it would get,
  // so the strip measures itself and the fold works in those pixels. Re-measured
  // on resize: drag the window narrower and more of the tail folds, which is the
  // whole point of keeping the test in pixels.
  const [stripWidth, setStripWidth] = useState(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStripWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => buildView(tree, stripWidth), [tree, stripWidth]);

  // Closing is deferred, opening cancels the deferral.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => () => cancelClose(), [cancelClose]);

  const onTip = useCallback(
    (node: ViewNode | null, el?: HTMLElement) => {
      cancelClose();
      if (!node || !el || !stripRef.current) {
        closeTimer.current = setTimeout(() => setTip(null), TIP_CLOSE_DELAY_MS);
        return;
      }
      const left = el.getBoundingClientRect().left - stripRef.current.getBoundingClientRect().left;
      setTip({ node, left });
    },
    [cancelClose]
  );

  if (view.length === 0) return null;

  const minLevel = finestLevel(view, Infinity);
  // Summed over the roots, not over every node — the tree double-counts by depth,
  // since a parent's rolled-up total already contains its children's.
  const grandTotal = view.reduce((sum, n) => sum + n.total, 0);
  // A tooltip over a counter lists what it stands for; over any other band it is
  // the usual read-only summary.
  const extraNodes = tip?.node.isExtra ? (tip.node.extra ?? []) : null;

  return (
    <div
      ref={stripRef}
      className={cn("relative w-full shrink-0", className)}
      onPointerLeave={() => {
        onHover(null);
        onTip(null);
      }}
    >
      <Tooltip open={tip !== null}>
        {/* One anchor for the whole strip: a 1px marker on the strip's bottom
            edge that slides to the hovered band's left. `absolute`, so it takes
            no part in the layout and cannot move anything, and it is the same
            element in every state, so nothing ever remounts underneath it. It is
            a pixel rather than zero-size because floating-ui tracks a moving
            reference through an IntersectionObserver, which needs a box. */}
        <TooltipTrigger asChild>
          <span aria-hidden className="pointer-events-none absolute size-px" style={{ top: "100%", left: tip?.left }} />
        </TooltipTrigger>
        <TooltipPortal>
          {/* Below and start-aligned, never above: everything the tooltip could
              describe is above it. Collision handling stays on so a band at the
              right edge shifts back into view — the strip is at the top of the
              section, so there is always room underneath and it only ever moves
              sideways. Lifted past the tooltip's default three elevation steps,
              with a border: the bands and the panel already sit well above the
              page, so three landed it on roughly the surface it was pointing
              at. */}
          <TooltipContent
            side="bottom"
            align="start"
            sideOffset={3}
            elevationOffset={2}
            // Inert for a band — drifting into it must not read as leaving the
            // band — but the extra-clusters list is the only way into the
            // clusters it stands for, so that one takes the cursor. Entering it
            // cancels the deferred close, leaving it starts one again.
            onPointerEnter={extraNodes ? cancelClose : undefined}
            onPointerLeave={extraNodes ? () => onTip(null) : undefined}
            // `pl` down to match `pt`, so the icon sits the same distance from
            // each edge of the corner it is tucked into.
            className={cn("border pl-1.5", extraNodes ? "pointer-events-auto p-1" : "pointer-events-none")}
          >
            {extraNodes ? (
              <ExtraList nodes={extraNodes} focusId={selectedId ?? hoveredId} onHover={onHover} onSelect={onSelect} />
            ) : (
              tip && <BandDetails node={tip.node} grandTotal={grandTotal} />
            )}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
      {/* Every column hugs its subtree — one row per level below it — and every
          row container is `items-end`, so a column bottoms out on the strip and
          lands on its level's row without any spacer. That is what keeps an L2
          root (parent dropped) on the middle row instead of floating to the top,
          and it costs the column no dead height above itself. The strip therefore
          hugs its tallest column rather than pinning a height off the level
          count.

          The roots are the strip's top-level groups, so they take `groupGap`
          rather than the tight `columnGap` the finer rows use. */}
      <div className="flex w-full flex-row items-end" style={{ gap: BAND.groupGap }}>
        {view.map((node) => (
          <IcicleNode
            key={node.id}
            node={node}
            minLevel={minLevel}
            selectedId={selectedId}
            hoveredId={hoveredId}
            ancestors={ancestors}
            onHover={onHover}
            onSelect={onSelect}
            onTip={onTip}
          />
        ))}
      </div>
    </div>
  );
}
