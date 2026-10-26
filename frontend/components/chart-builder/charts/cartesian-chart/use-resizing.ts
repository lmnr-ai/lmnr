import { useEffect, useRef, useState } from "react";

const SETTLE_MS = 150;

/**
 * True while the element's size is changing, until it holds still for `SETTLE_MS`. Dense charts
 * re-lay out every point on each size change, so they sit out a drag-resize and draw once at the end.
 */
export const useResizing = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: { width: number; height: number } | null = null;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // The first observation is the initial size, not a resize.
      if (last && (last.width !== width || last.height !== height)) {
        setResizing(true);
        clearTimeout(timer);
        timer = setTimeout(() => setResizing(false), SETTLE_MS);
      }
      last = { width, height };
    });
    observer.observe(element);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return { ref, resizing };
};
