import { elementScroll, useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useRef } from "react";

import { type ConversationRow, type MessageAnchor } from "./build-rows";
import { useLinkedRow } from "./use-linked-row";
import { usePremeasureAbove } from "./use-premeasure-above";

const HEADER_ESTIMATE_SIZE = 40;
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
  const estimateSize = (i: number) => (rows[i]?.kind === "message" ? MESSAGE_ESTIMATE_SIZE : HEADER_ESTIMATE_SIZE);
  const linkedRow = useLinkedRow(scrollRef, rows, linked, estimateSize);

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
