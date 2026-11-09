import { type Virtualizer } from "@tanstack/react-virtual";
import { useMemo } from "react";

import {
  filterToViewport,
  useReportVisibleTimeRange,
} from "@/components/traces/trace-view/use-report-visible-time-range";
import { type TraceRow } from "@/lib/traces/types";

import { useChatSession } from "../store";

/** Tells the session timeline which stretch of time the turns on screen cover, for its "in view" highlight. */
export function useReportVisibleTurns(virtualizer: Virtualizer<HTMLDivElement, Element>, traces: TraceRow[]) {
  const setVisibleRange = useChatSession((s) => s.setVisibleRange);
  const items = virtualizer.getVirtualItems();
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;

  const { start, end } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    // A turn taller than the viewport can have its center off-screen while it's the only thing in view.
    const centered = filterToViewport(items, scrollOffset, viewportHeight);
    const inView =
      centered.length > 0
        ? centered
        : items.filter((i) => i.end > scrollOffset && i.start < scrollOffset + viewportHeight);
    for (const item of inView) {
      const trace = traces[item.index];
      const start = Date.parse(trace?.startTime ?? "");
      const end = Date.parse(trace?.endTime ?? "");
      // A live turn's first delta can lack times; one NaN would blank the whole range.
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      min = Math.min(min, start);
      max = Math.max(max, end);
    }
    return Number.isFinite(min) && Number.isFinite(max) ? { start: min, end: max } : {};
  }, [items, scrollOffset, viewportHeight, traces]);

  useReportVisibleTimeRange({ start, end, setTimeRange: setVisibleRange });
}
