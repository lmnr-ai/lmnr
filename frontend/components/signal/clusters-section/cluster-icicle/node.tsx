// One column of the strip: a band, and under it the row of columns for whatever
// that cluster breaks down into.
"use client";

import { motion } from "framer-motion";
import { type CSSProperties, memo } from "react";
import { shallow } from "zustand/shallow";

import { getNodeFocus, useClusterFocusContext } from "@/components/signal/clusters-section/focus-store";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import ClusterBand, { type BandState } from "./cluster-band";
import { BAND, PANEL, STEM, SURFACE } from "./constants";
import ExtraBand from "./extra-band";
import { childRowGap, type ViewNode } from "./fold";

export interface NodeProps {
  node: ViewNode;
  /** Finest level in the tree — the only level that pads along the bottom. */
  minLevel: number;
  /** Cluster pinned by a click. Owned by the URL, so it comes down as a prop
   *  rather than out of the focus store; it only changes on a click. */
  selectedId: string | null;
  /** id → its ancestors, so a node can tell whether it is under the focus. */
  ancestors: Map<string, Set<string>>;
  onSelect: (id: string) => void;
  /** Aim the strip's one tooltip at this band, or clear it on `null`. */
  onTip: (node: ViewNode | null, el?: HTMLElement) => void;
  /** Drawn inside a parent's children row, so there is a band above to join. A
   *  root — of any level, orphan L1 included — has nothing up there. */
  nested?: boolean;
}

// Named separately from the memoised export so the recursion below goes through
// `memo` — a self-reference inside a named function expression would not.
function IcicleNodeColumn({ node, minLevel, selectedId, ancestors, onSelect, onTip, nested }: NodeProps) {
  const { isFocus, inFocus, holdsFocus } = useClusterFocusContext(
    (state) => getNodeFocus(state, node, selectedId, ancestors),
    shallow
  );
  const isSelected = selectedId !== null && node.id === selectedId;

  const state: BandState = isFocus ? "hover" : inFocus ? "default" : "muted";

  // Only a parent gets a panel; on a leaf it would just double the ring around a
  // single pill. The band itself is styled the same either way. Keyed on the
  // focus, so hovering opens it too — the panel is what shows which children are
  // inside this cluster, which is most of the point of pointing at it.
  const panelled = isFocus && node.children.length > 0;

  // The finest level always carries the bottom padding; nothing coarser ever
  // does. It sits on the column, so a focused parent's panel covers it, and being
  // unconditional it never moves a band — the strip's geometry is the same in
  // every state. Keyed on level, not on having children: a childless L2 is still
  // an L2.
  const padBottom = node.level === minLevel ? PANEL.padBottom : 0;

  const style: CSSProperties = {
    // Layered, not replaced: the neutral surface step comes off the class as
    // `background-color` and the cluster wash goes on top of it as a flat
    // `background-image`. Setting `backgroundColor` here would override the class
    // outright and lose the surface. A counter has no cluster colour to wash on.
    backgroundImage: node.isExtra
      ? undefined
      : `linear-gradient(${withOpacity(node.color, BAND.fill[state])}, ${withOpacity(node.color, BAND.fill[state])})`,
    boxShadow: `inset 0 0 0 1px ${withOpacity(node.color, BAND.outline[state])}`,
    borderRadius: BAND.radius,
    // While the panel is open the band stops being a pill and becomes the head of
    // the panel: squared off along the bottom, and pulled back to `radiusTop` on
    // top so it matches the panel's own corner instead of bulging past it at the
    // full pill radius.
    ...(panelled
      ? {
          borderStartStartRadius: PANEL.radiusTop,
          borderStartEndRadius: PANEL.radiusTop,
          borderEndStartRadius: 0,
          borderEndEndRadius: 0,
        }
      : {}),
    paddingInline: BAND.paddingX,
    height: BAND.rowHeight,
  };

  // The focused cluster's column spans its own band *and* every descendant row,
  // so painting it here is what turns the subtree into one contained panel. The
  // fill is a neutral surface step rather than the cluster's colour: with a dozen
  // coloured bands sitting on it, another tint of the same hue underneath just
  // muddied them. The ring is the cluster's colour, which is what identifies the
  // panel. `outline`, not a border or an inset shadow: it is drawn *outside* the
  // box and takes no part in layout, so the ring sits around the panel without
  // shrinking its contents.
  const panel: CSSProperties = panelled
    ? {
        outline: `${PANEL.outlineWidth}px solid ${withOpacity(node.color, PANEL.outline)}`,
        outlineOffset: 0,
        // `PANEL.radius` on the bottom two only. The focused band spans the whole
        // top edge, so BOTH top corners are really the band's — they have to be
        // its `radiusTop` or the ring curves away from the corner it is supposed
        // to be hugging.
        borderStartStartRadius: PANEL.radiusTop,
        borderStartEndRadius: PANEL.radiusTop,
        borderEndStartRadius: PANEL.radius,
        borderEndEndRadius: PANEL.radius,
      }
    : {};

  // `flexGrow` is the value axis; `flexBasis: 0` makes the sibling split purely
  // proportional. Depth flows top-to-bottom via the column direction.
  return (
    <motion.div
      className={cn("relative flex min-w-0 flex-col", panelled && SURFACE.panel)}
      // The floor has to sit on the flex item itself. On the band inside it the
      // column still carries `min-width: 0`, so the split happily shrinks the
      // column past the band and the pills overlap.
      //
      // The counter takes no share of the row: it stands for a set, whose size is
      // not a quantity on the same axis as its neighbours. It HUGS instead —
      // `flexBasis: auto` off its own label, so a "+1" is a small pill and a
      // "+999" is a wide one, rather than every counter being cut to the same
      // slot. The fold budgets it at its widest possible label instead of at this
      // width; see `EXTRA_BAND_WIDTH`. `flexShrink: 0` so a crowded row squeezes
      // the real bands, never the thing already at its minimum.
      style={{
        flexBasis: node.isExtra ? "auto" : 0,
        flexShrink: node.isExtra ? 0 : 1,
        gap: BAND.rowGap,
        // Not a floor of its own — what this column's whole subtree needs. See
        // `annotateNeed`. A counter has none at all: a floor is exactly what would
        // stop it hugging.
        minWidth: node.isExtra ? undefined : (node.need ?? BAND.minWidth),
        paddingBottom: padBottom,
        ...panel,
      }}
      initial={{ flexGrow: 0 }}
      animate={{ flexGrow: node.isExtra ? 0 : Math.max(node.total, 0.0001) }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* The one mark that says this band is INSIDE the one above it. Every
          column's top edge is its band's top edge and rows bottom-align, so the
          gap directly above is always the parent's `rowGap` — nothing to
          measure. */}
      {nested && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute -translate-x-1/2", STEM.className)}
          style={{ bottom: "100%", left: "50%", width: STEM.width, height: BAND.rowGap }}
        />
      )}
      {node.isExtra ? (
        <ExtraBand node={node} holdsFocus={holdsFocus} style={style} onTip={onTip} />
      ) : (
        <ClusterBand
          node={node}
          state={state}
          inFocus={inFocus}
          isSelected={isSelected}
          style={style}
          onSelect={onSelect}
          onTip={onTip}
        />
      )}
      {(node.foldedDepth ?? 0) > 0 && (
        // The rows this column stands over. Pure height, no width — an empty flex
        // child contributes nothing across — but without it the column is one row
        // tall and `items-end` drops it onto the finest row, where it reads as a
        // stray pill with no parent above it.
        <div
          aria-hidden
          style={{
            height:
              (node.foldedDepth ?? 0) * BAND.rowHeight +
              ((node.foldedDepth ?? 0) - 1) * BAND.rowGap +
              (node.level - (node.foldedDepth ?? 0) === minLevel ? PANEL.padBottom : 0),
          }}
        />
      )}
      {node.children.length > 0 && (
        // Focusing this cluster pulls its children in from the panel's side
        // edges. It lands on the row rather than on the individual bands so the
        // inset is one continuous margin around the group instead of a gap around
        // every pill. The vertical margin is `padBottom`, on the column.
        <div
          className="flex min-w-0 flex-row items-end"
          // Same function the width arithmetic budgets with — see `childRowGap`.
          style={{ gap: childRowGap(node.level), paddingInline: panelled ? PANEL.padX : 0 }}
        >
          {node.children.map((child) => (
            <IcicleNode
              key={child.id}
              node={child}
              minLevel={minLevel}
              nested
              selectedId={selectedId}
              ancestors={ancestors}
              onSelect={onSelect}
              onTip={onTip}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

// `memo` is the point of the focus store: every prop is stable across a pointer
// move, so a node the new focus does not affect bails out instead of rebuilding
// its gradients and its motion element.
const IcicleNode = memo(IcicleNodeColumn);

export default IcicleNode;
