// The clusters behind an extra-clusters counter, in the shape of a cluster list:
// icon, name, bar, count.
//
// The counter is the ONLY way into these clusters — they have no band of their
// own — so this list is interactive where the rest of the tooltip is inert:
// hovering a row focuses that cluster exactly as hovering a band would, and
// clicking it selects.
"use client";

import { type CSSProperties } from "react";

import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { getFocusId, useClusterFocusContext } from "@/components/signal/clusters-section/focus-store";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { EXTRA_LIST_HEIGHT } from "./constants";
import { type ViewNode } from "./fold";

/** Opacity of a row's bar. Under the cluster's full colour, so a column of bars
 *  reads as one chart rather than as a row of marks. */
const BAR_OPACITY = 0.7;

/** A count as a percentage of `total`, floored at 2% when it is non-zero so a
 *  cluster with a handful of events still draws something. */
function sharePct(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(Math.min((count / total) * 100, 100), count > 0 ? 2 : 0);
}

interface Props {
  nodes: ViewNode[];
  /** Cluster pinned by a click; hover comes from the focus store. */
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

export default function ExtraList({ nodes, selectedId, onHover, onSelect }: Props) {
  // Subscribed here rather than passed in, so hovering a row does not re-render
  // the strip that owns this tooltip.
  const focusId = useClusterFocusContext((state) => getFocusId(state, selectedId));

  // The denominator is THIS LIST, not the strip. Every cluster in here was folded
  // away for being too small to draw, so measuring them against the signal's
  // total gives a column of empty bars. Against the LARGEST of them the top of
  // the list is full and everything else is read off it — a share-of-sum across
  // thirty clusters is the same unreadable column one scale up.
  const listMax = nodes.reduce((max, n) => Math.max(max, n.total), 0);

  return (
    <div
      className="flex min-w-[220px] max-w-xs flex-col overflow-y-auto scroll-fade-y scrollbar-none"
      // The utility's own default fade is 2rem, which on these rows eats most of
      // the first and last one.
      style={{ maxHeight: EXTRA_LIST_HEIGHT, "--scroll-fade-size": "12px" } as CSSProperties}
    >
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          className={cn(
            "flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
            "text-secondary-foreground hover:bg-surface-up-2",
            node.id === focusId && "bg-surface-up-3 font-medium text-foreground"
          )}
          onPointerEnter={() => onHover(node.id)}
          onPointerLeave={() => onHover(null)}
          onClick={() => onSelect(node.id)}
        >
          <ClusterIcon iconVariant={node.children.length > 0 ? "boxes" : "box"} color={node.color} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="h-1 w-14 shrink-0 overflow-hidden rounded-[2px] bg-foreground/10">
            <span
              className="block h-full"
              style={{
                width: `${sharePct(node.total, listMax)}%`,
                backgroundColor: withOpacity(node.color, BAR_OPACITY),
              }}
            />
          </span>
          {/* Fixed width, so the bars to its left all end in the same place — the
              count sits AFTER them, so a variable-width number shifts every bar
              by a different amount. Sized for "9,999"; a bigger number grows and
              takes that one row's bar with it. */}
          <span className="min-w-[38px] shrink-0 text-right tabular-nums text-muted-foreground">
            {node.total.toLocaleString()}
          </span>
        </button>
      ))}
    </div>
  );
}
