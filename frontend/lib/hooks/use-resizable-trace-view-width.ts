import { type Resizable } from "re-resizable";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribeWindow = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
};

const getWindowWidth = () => (typeof window === "undefined" ? 1000 : window.innerWidth);
const getServerWidth = () => 1000;

interface UseResizableTraceViewWidthProps {
  initialWidth?: number;
  onSaveWidth?: (width: number) => Promise<void> | void;
}

/**
 * A hook to manage the width of a resizable panel (typically TraceView).
 * It handles:
 * 1. Hydration-safe initial width calculation.
 * 2. Automatic shrinking when the window is resized.
 * 3. Synchronization with a Resizable component ref.
 * 4. Persistence via a callback (usually for cookies).
 */
export function useResizableTraceViewWidth({ initialWidth, onSaveWidth }: UseResizableTraceViewWidthProps = {}) {
  const resizableRef = useRef<Resizable>(null);
  const windowWidth = useSyncExternalStore(subscribeWindow, getWindowWidth, getServerWidth);
  const [userWidth, setUserWidth] = useState<number | null>(null);

  // Derive the width during render.
  // Priority: User's current session resize > Persisted cookie > 75% of viewport
  let width = userWidth ?? initialWidth ?? Math.min(windowWidth * 0.75, 1100);

  // Constraints: Ensure the panel doesn't overflow the viewport
  const minPadding = 180;
  const snappedPadding = 240;

  if (windowWidth > 0 && width > windowWidth - minPadding) {
    width = windowWidth - snappedPadding;
  }

  // Effect to synchronize the Resizable DOM element when width changes (e.g. on window resize)
  useEffect(() => {
    if (resizableRef.current && windowWidth > 0) {
      resizableRef.current.updateSize({ width });

      // If we had to snap the width due to window being too small, persist that choice
      if (width === windowWidth - snappedPadding) {
        onSaveWidth?.(width);
      }
    }
  }, [windowWidth, width, onSaveWidth]);

  const handleResizeStop = (_event: any, _direction: any, _elementRef: any, delta: { width: number }) => {
    const newWidth = width + delta.width;
    setUserWidth(newWidth);
    onSaveWidth?.(newWidth);
  };

  return {
    width,
    resizableRef,
    handleResizeStop,
  };
}
