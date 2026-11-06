import { elementScroll, useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useRef } from "react";

import { type ConversationRow, type MessageAnchor } from "./build-rows";
import { useLinkedRow } from "./use-linked-row";
import { usePremeasureAbove } from "./use-premeasure-above";
import { bandInset } from "./use-sticky-band";

const HEADER_ESTIMATE_SIZE = 40;
// The opened context card (card + rail stub), exact: a linked context message lands below its copy in the sticky band,
// so an estimate off by a few pixels would move the landing once the row is measured.
const OPEN_CONTEXT_SIZE = 46;
const MESSAGE_ESTIMATE_SIZE = 240;
const NEVER_ADJUST = () => false;

/**
 * The conversation list's virtualizer, landed and held on the `linked` message. Owns the landing protocol: the
 * initial offset, re-pinning after measurements, pausing the virtualizer's own size corrections while holding, and
 * pre-measuring the rows above the landing. Callers render `items` and `premeasure` with `virtualizer.measureElement`.
 */
export const useAnchoredVirtualizer = ({
  scrollRef,
  rows,
  linked,
  searching,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  rows: ConversationRow[];
  /** Read once, at mount. */
  linked: MessageAnchor | undefined;
  /** Search needs every row mounted (wide overscan) and no hidden measuring rows. */
  searching: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const estimateSize = (i: number) => {
    const row = rows[i];
    if (row?.kind === "message") return MESSAGE_ESTIMATE_SIZE;
    return row?.kind === "context" && row.open ? OPEN_CONTEXT_SIZE : HEADER_ESTIMATE_SIZE;
  };
  // A linked context message lands below the context card the sticky band pins over the top.
  const inset = useCallback(
    (virtualizer: Virtualizer<HTMLDivElement, Element>, index: number) => bandInset(rows, virtualizer, index),
    [rows]
  );
  const linkedRow = useLinkedRow(scrollRef, rows, linked, estimateSize, inset);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: searching ? 100 : 10,
    initialOffset: linkedRow.initialOffset,
    onChange: linkedRow.onChange,
    // Grow the container before a size correction scrolls: near the end of the list the browser would otherwise clamp
    // it to the old height, and the cut-off part shows as a jump once the container grows.
    scrollToFn: (offset, options, instance) => {
      if (containerRef.current) containerRef.current.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
    },
    // Rows move in the same tick as scrollTop corrections, so no frame paints old positions under a new scroll.
    directDomUpdates: true,
    // `top`, not `transform`: sticky is resolved before transforms, so a translated row would push its pinned
    // "Show less" past the viewport by the row's offset.
    directDomUpdatesMode: "position",
  });
  // Set during render so it already covers the first rows' measurements.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = linkedRow.holding ? NEVER_ADJUST : undefined;

  const setContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      virtualizer.containerRef(node);
    },
    [virtualizer]
  );

  const premeasure = usePremeasureAbove(virtualizer, linkedRow.index, searching);

  return {
    /** For callers that scroll or observe the list themselves (sticky band, scroll-to-bottom). */
    virtualizer,
    items: virtualizer.getVirtualItems().map((item) => item.index),
    premeasure,
    setContainer,
    highlightedIndex: linkedRow.holding ? linkedRow.index : -1,
  };
};
