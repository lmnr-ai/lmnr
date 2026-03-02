import { useCallback, useEffect, useState } from "react";

const SIDEBAR_MIN_PADDING = 180;
const SIDEBAR_SNAP_PADDING = 240;
const DEFAULT_MAX_WIDTH = 1100;
const DEFAULT_VIEWPORT_RATIO = 0.75;

interface UseResizableTraceViewWidthProps {
  initialWidth?: number;
  onSaveWidth?: (width: number) => Promise<void> | void;
}

function clampToViewport(width: number, viewportWidth: number): number {
  return viewportWidth > 0 && width > viewportWidth - SIDEBAR_MIN_PADDING
    ? viewportWidth - SIDEBAR_SNAP_PADDING
    : width;
}

function getDefaultWidth(): number {
  return Math.min(window.innerWidth * DEFAULT_VIEWPORT_RATIO, DEFAULT_MAX_WIDTH);
}

/** Resizable trace-view width, clamped to the viewport on init and on resize.
 *  Priority: cookie > viewport (0.75%) > const value
 * */
export function useResizableTraceViewWidth({ initialWidth, onSaveWidth }: UseResizableTraceViewWidthProps = {}) {
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return initialWidth ?? DEFAULT_MAX_WIDTH;
    return clampToViewport(initialWidth ?? getDefaultWidth(), window.innerWidth);
  });

  useEffect(() => {
    const onResize = () => {
      const clamped = clampToViewport(width, window.innerWidth);
      if (clamped !== width) {
        setWidth(clamped);
        onSaveWidth?.(clamped);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width, onSaveWidth]);

  const handleResizeStop = useCallback(
    (_event: unknown, _direction: unknown, _elementRef: unknown, delta: { width: number }) => {
      const newWidth = clampToViewport(width + delta.width, window.innerWidth);
      setWidth(newWidth);
      onSaveWidth?.(newWidth);
    },
    [width, onSaveWidth]
  );

  return { width, handleResizeStop };
}
