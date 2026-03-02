import { isNil } from "lodash";
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
    const base = !isNil(initialWidth) ? initialWidth : DEFAULT_MAX_WIDTH;
    if (typeof window === "undefined") return base;
    return clampToViewport(!isNil(initialWidth) ? base : getDefaultWidth(), window.innerWidth);
  });

  useEffect(() => {
    const controller = new AbortController();

    const onResize = () => {
      setWidth((current) => {
        const clamped = clampToViewport(current, window.innerWidth);
        if (clamped !== current) onSaveWidth?.(clamped);
        return clamped;
      });
    };

    window.addEventListener("resize", onResize, { signal: controller.signal });

    return () => controller.abort();
  }, [onSaveWidth]);

  const handleResizeStop = useCallback(
    (_event: unknown, _direction: unknown, _elementRef: unknown, delta: { width: number }) => {
      setWidth((prev) => {
        const newWidth = clampToViewport(prev + delta.width, window.innerWidth);
        onSaveWidth?.(newWidth);
        return newWidth;
      });
    },
    [onSaveWidth]
  );

  return { width, handleResizeStop };
}
