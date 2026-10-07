// Open/close lifecycle for the readout's hover card: the delays, the captured
// trigger rect the fixed-position card is pinned to, and the dismissals.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Long enough that crossing the header on the way somewhere else does not open
// it, short enough that aiming at it feels direct.
const OPEN_DELAY_MS = 220;
// Deferred close, so the few pixels between the header and the card's own edge
// are not a gap the pointer can fall through.
const CLOSE_DELAY_MS = 80;

export interface Rect {
  top: number;
  left: number;
  width: number;
}

export function useHoverCard() {
  const [rect, setRect] = useState<Rect | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  // So the scroll-dismiss below can tell the card's own list from everything else.
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  // The rect is measured when the timer FIRES, not on enter: the card is
  // position-fixed, so a rect captured before the page settled would pin it to
  // where the header used to be.
  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => {
      const el = headerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width });
    }, OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setRect(null), CLOSE_DELAY_MS);
  }, [clearTimers]);

  const closeNow = useCallback(() => {
    clearTimers();
    setRect(null);
  }, [clearTimers]);

  // The card is position-fixed against a rect captured when it opened, so
  // anything that moves the trigger strands it. Capture phase, because the page
  // scroller is an ancestor and scroll does not bubble — which also means this
  // sees the card's OWN list scrolling, and closing on that would put every
  // cluster past the first screenful out of reach.
  useEffect(() => {
    if (rect === null) return;
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && cardRef.current?.contains(target)) return;
      closeNow();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeNow);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", closeNow);
    };
  }, [rect, closeNow]);

  return { rect, headerRef, cardRef, clearTimers, scheduleOpen, scheduleClose, closeNow };
}
