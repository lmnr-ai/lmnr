import { RefObject, useEffect } from "react";

import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store";
import { type CondensedTimelineSpan } from "@/components/traces/trace-view/trace-view-store-utils";

import { ROW_HEIGHT } from "./condensed-timeline-element";

const HEADER_HEIGHT = 24; // h-6 = 1.5rem = 24px

/**
 * Hook for auto-scrolling to center the selected span in the timeline view.
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

    // Calculate vertical pixel position from row
    const spanTopPx = selectedCondensedSpan.row * ROW_HEIGHT;

    // Center the span in the view horizontally
    const targetScrollX = spanLeftPx + spanWidthPx / 2 - containerWidth / 2;

    // Center the span in the view vertically (accounting for sticky header)
    const targetScrollY = spanTopPx - containerHeight / 2 + HEADER_HEIGHT;

    container.scrollTo({
      left: Math.max(0, targetScrollX),
      top: Math.max(0, targetScrollY),
      behavior: "smooth",
    });
  }, [selectedSpan, condensedSpans, scrollRef]);
}
