"use client";

import { type RefObject, useEffect, useState } from "react";

interface Options {
  /** Number of discrete steps to walk through. */
  steps: number;
  /** Wall-clock ms per step. steps * stepMs is the total run time. */
  stepMs?: number;
}

/**
 * Walks 0 → steps once the element scrolls into view, one step per stepMs.
 * Driven by rAF so it stays frame-aligned and pauses with a backgrounded tab.
 * Reduced-motion jumps straight to the end.
 */
export function useStreamIn(ref: RefObject<HTMLElement | null>, { steps, stepMs = 40 }: Options): number {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || steps <= 0) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(steps);
      return;
    }

    let raf = 0;
    let start: number | null = null;
    let last = -1;

    const tick = (now: number) => {
      start ??= now;
      const next = Math.min(steps, Math.floor((now - start) / stepMs));
      // Only re-render on a step boundary, not every frame.
      if (next !== last) {
        last = next;
        setRevealed(next);
      }
      if (next < steps) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ref, steps, stepMs]);

  return revealed;
}
