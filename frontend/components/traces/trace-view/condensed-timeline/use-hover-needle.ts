import { type RefObject, useCallback, useState } from "react";

/**
 * Hook for tracking hover position and calculating time on the condensed timeline.
 * Returns needleLeft (percentage of visible container width) for positioning the needle
 * outside the scroll container, and hoverTimeMs (calculated from scroll position).
 */
export function useHoverNeedle(
  scrollRef: RefObject<HTMLDivElement | null>,
  totalDurationMs: number
) {
  const [needleLeft, setNeedleLeft] = useState<number | null>(null);
  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Simple: needle position as percentage of visible width
    setNeedleLeft((mouseX / rect.width) * 100);

    // Time: where in the full content is the mouse?
    const absoluteX = mouseX + container.scrollLeft;
    const timePercent = absoluteX / container.scrollWidth;
    setHoverTimeMs(timePercent * totalDurationMs);
  }, [scrollRef, totalDurationMs]);

  const handleMouseLeave = useCallback(() => {
    setNeedleLeft(null);
    setHoverTimeMs(null);
  }, []);

  return { needleLeft, hoverTimeMs, handleMouseMove, handleMouseLeave };
}
