import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";

import { type FilterTag } from "./types";

const TAG_GAP = 4;
// Main input min-width + "+N" chip + slack.
const RESERVED_WIDTH = 140;
const UNMEASURED_TAG_WIDTH = 160;

// Folds the oldest tags into "+N" so the newest (incl. one being built) stay visible.
export const useTagOverflow = (tags: FilterTag[], rowRef: RefObject<HTMLDivElement | null>) => {
  const observersRef = useRef<Map<string, ResizeObserver>>(new Map());
  const [widths, setWidths] = useState<Map<string, number>>(() => new Map());
  const [rowWidth, setRowWidth] = useState(0);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    setRowWidth(row.clientWidth);
    const observer = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef]);

  // Stable per tag: a fresh ref callback each render would loop on setWidths.
  const refCallbacksRef = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map());
  const measureRef = useCallback((tagId: string) => {
    let callback = refCallbacksRef.current.get(tagId);
    if (!callback) {
      callback = (el: HTMLElement | null) => {
        observersRef.current.get(tagId)?.disconnect();
        observersRef.current.delete(tagId);
        if (!el) return;
        const observer = new ResizeObserver(() => {
          const width = el.offsetWidth;
          setWidths((prev) => (prev.get(tagId) === width ? prev : new Map(prev).set(tagId, width)));
        });
        observer.observe(el);
        observersRef.current.set(tagId, observer);
      };
      refCallbacksRef.current.set(tagId, callback);
    }
    return callback;
  }, []);

  if (rowWidth === 0) return { hiddenCount: 0, measureRef };

  const available = rowWidth - RESERVED_WIDTH;
  let used = 0;
  let visible = 0;
  for (let i = tags.length - 1; i >= 0; i--) {
    used += (widths.get(tags[i].id) ?? UNMEASURED_TAG_WIDTH) + TAG_GAP;
    if (used > available && visible > 0) break;
    visible++;
  }

  return { hiddenCount: tags.length - visible, measureRef };
};
