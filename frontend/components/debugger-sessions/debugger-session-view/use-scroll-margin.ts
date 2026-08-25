import { type DependencyList, type RefObject, useLayoutEffect, useState } from "react";

/**
 * `scrollMargin` for a virtualizer bound to a SHARED scroll element: the measured
 * offset of `ref` within the scroll content. Re-measured whenever the scroll
 * content resizes (a block expands/collapses, a lazy row swaps in) — NOT on
 * scroll, so scrolling stays cheap. `deps` should carry any condition that
 * mounts/rebuilds `ref`'s element (e.g. a segment's `expanded`), since a ref
 * alone isn't reactive.
 */
export function useScrollMargin(
  ref: RefObject<HTMLElement | null>,
  scrollEl: HTMLElement | null,
  deps: DependencyList = []
): number {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !scrollEl) return;

    const measure = () => {
      const next = Math.round(
        el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
      );
      // ±1px guard keeps the measurement convergent (no setState loop).
      setScrollMargin((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
    };
    measure();

    // Observe the shared scroll content so a height change anywhere above this
    // element re-measures its offset. Scroll doesn't resize content, so this
    // never fires while scrolling.
    const content = scrollEl.firstElementChild;
    if (!content) return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, scrollEl, ...deps]);

  return scrollMargin;
}
