import { useEffect, useRef } from "react";

import { useTraceViewBaseStore } from "./store/base";

/**
 * Filter TanStack virtual items down to those actually inside the viewport,
 * excluding the overscan buffer. TanStack Virtual has no built-in accessor for
 * this — `getVirtualItems()` includes the overscan — so we compare each item's
 * pixel range to the virtualizer's scroll offset and scroll-rect height.
 */
export const filterToViewport = <T extends { start: number; end: number }>(
  items: T[],
  scrollOffset: number,
  viewportHeight: number
): T[] => {
  if (viewportHeight <= 0) return items;
  const top = scrollOffset;
  const bottom = scrollOffset + viewportHeight;
  return items.filter((item) => item.end > top && item.start < bottom);
};

/**
 * Writes the given time range to the store, throttled to one update per animation
 * frame and skipped when the range is unchanged since the last commit. Clears the
 * range when the caller unmounts so a switch between transcript and tree hands
 * ownership cleanly from one producer to the other.
 */
export const useReportVisibleTimeRange = ({ start, end }: { start?: number; end?: number }) => {
  const setScrollTimeRange = useTraceViewBaseStore((state) => state.setScrollTimeRange);
  const pendingRef = useRef<{ start?: number; end?: number }>({ start: undefined, end: undefined });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<{ start?: number; end?: number }>({ start: undefined, end: undefined });

  useEffect(() => {
    pendingRef.current = { start, end };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const { start: s, end: e } = pendingRef.current;
      if (lastRef.current.start === s && lastRef.current.end === e) return;
      lastRef.current = { start: s, end: e };
      setScrollTimeRange(s, e);
    });
  }, [start, end, setScrollTimeRange]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastRef.current = { start: undefined, end: undefined };
      setScrollTimeRange(undefined, undefined);
    },
    [setScrollTimeRange]
  );
};
