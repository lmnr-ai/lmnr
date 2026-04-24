import { useEffect, useRef } from "react";

/**
 * Filter TanStack virtual items down to those meaningfully inside the viewport,
 * excluding the overscan buffer AND edge slivers. TanStack Virtual has no
 * built-in accessor — `getVirtualItems()` includes overscan.
 *
 * We use a center-in-viewport rule rather than any-overlap: a row only counts
 * if its vertical center is inside `[scrollOffset, scrollOffset+height]`.
 * Any-overlap is too permissive — a 1px sliver of the next row at the viewport
 * edge would count as "visible," and if that row carried a wildly different
 * time (e.g. a trace 24h later), it would drag the reported range across a
 * session gap and light up segments the user isn't looking at.
 */
export const filterToViewport = <T extends { start: number; size: number }>(
  items: T[],
  scrollOffset: number,
  viewportHeight: number
): T[] => {
  if (viewportHeight <= 0) return items;
  const top = scrollOffset;
  const bottom = scrollOffset + viewportHeight;
  return items.filter((item) => {
    const center = item.start + item.size / 2;
    return center >= top && center < bottom;
  });
};

/**
 * Writes the given time range to the store, throttled to one update per animation
 * frame and skipped when the range is unchanged since the last commit. Clears the
 * range when the caller unmounts so a switch between transcript and tree hands
 * ownership cleanly from one producer to the other.
 */
export const useReportVisibleTimeRange = ({
  start,
  end,
  setTimeRange,
}: {
  start?: number;
  end?: number;
  setTimeRange: (start?: number, end?: number) => void;
}) => {
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
      setTimeRange(s, e);
    });
  }, [start, end, setTimeRange]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastRef.current = { start: undefined, end: undefined };
      setTimeRange(undefined, undefined);
    },
    [setTimeRange]
  );
};
