import { type RefObject, useEffect } from "react";

import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { type CondensedTimelineSpan } from "@/components/traces/trace-view/store/utils";

import { ROW_HEIGHT } from "./condensed-timeline-element";

const HEADER_HEIGHT = 24; // h-6 = 1.5rem = 24px

/**
 * Hook for auto-scrolling to the selected span in the timeline view.
 * Only scrolls Y if span is not already visible.
 */
export function useScrollToSpan(
  scrollRef: RefObject<HTMLDivElement | null>,
  selectedSpan: TraceViewSpan | null | undefined,
  condensedSpans: CondensedTimelineSpan[]
) {
  useEffect(() => {
    if (!selectedSpan || !scrollRef.current) return;

    // Find the selected span in condensedSpans
    const selectedCondensedSpan = condensedSpans.find((cs) => cs.span.spanId === selectedSpan.spanId);
    if (!selectedCondensedSpan) return;

    // Get container dimensions
    const container = scrollRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const scrollWidth = container.scrollWidth;

    // Calculate horizontal pixel position from percentage
    const spanLeftPx = (selectedCondensedSpan.left / 100) * scrollWidth;
    const spanWidthPx = (selectedCondensedSpan.width / 100) * scrollWidth;

    // Calculate vertical pixel position from row (offset by header since content is below sticky header)
    const spanTopPx = HEADER_HEIGHT + selectedCondensedSpan.row * ROW_HEIGHT;
    const spanBottomPx = spanTopPx + ROW_HEIGHT;

    // Center the span in the view horizontally
    const targetScrollX = spanLeftPx + spanWidthPx / 2 - containerWidth / 2;

    // Check if span is already visible vertically (accounting for sticky header)
    const visibleTop = container.scrollTop + HEADER_HEIGHT;
    const visibleBottom = container.scrollTop + containerHeight;
    const isVisibleY = spanTopPx >= visibleTop && spanBottomPx <= visibleBottom;

    // Only scroll Y if not already visible
    const targetScrollY = isVisibleY ? container.scrollTop : spanTopPx - HEADER_HEIGHT;

    container.scrollTo({
      left: Math.max(0, targetScrollX),
      top: Math.max(0, targetScrollY),
      behavior: "smooth",
    });
  }, [selectedSpan, condensedSpans, scrollRef]);
}
