import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// "Pinned" slack: must exceed the article's bottom padding (so stopping at the
// last block still counts as "at the bottom") yet let a scroll-up unpin.
const DEFAULT_SLACK_PX = 200;

/**
 * iMessage-style stick-to-bottom for a scroll container, decided at growth time:
 * when content height changes, follow it iff the viewport was within `slackPx`
 * of the bottom of the PREVIOUS height. No scroll listener — the geometry at the
 * moment of growth is the whole state, so a live session follows streamed spans
 * without the user ever scrolling. Returns a smooth `scrollToBottom` for manual
 * jumps (e.g. a "new run" pill). Inert until `enabled` (the initial fetch must
 * settle first, else an "at bottom" reading on a trivially-short page yanks the
 * viewport down).
 */
export function useStickToBottom(
  scrollEl: HTMLElement | null,
  { enabled, slackPx = DEFAULT_SLACK_PX }: { enabled: boolean; slackPx?: number }
) {
  const prevHeightRef = useRef(0);

  // Seed the pre-growth height after settle, so the first history render itself
  // doesn't read as growth from a short page.
  useLayoutEffect(() => {
    if (!enabled || !scrollEl) return;
    prevHeightRef.current = scrollEl.scrollHeight;
  }, [enabled, scrollEl]);

  useEffect(() => {
    if (!enabled || !scrollEl) return;
    const content = scrollEl.firstElementChild;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const prev = prevHeightRef.current;
      prevHeightRef.current = scrollEl.scrollHeight;
      const wasAtBottom = scrollEl.scrollTop + scrollEl.clientHeight >= prev - slackPx;
      // "instant" overrides the container's scroll-smooth — an animated snap lags
      // behind rapid streaming growth.
      if (wasAtBottom) scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "instant" });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [enabled, scrollEl, slackPx]);

  return useCallback(() => {
    scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
  }, [scrollEl]);
}
