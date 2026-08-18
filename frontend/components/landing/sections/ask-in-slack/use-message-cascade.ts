"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Walks 0 → delays.length once the element scrolls into view, waiting
 * `delays[i]` before revealing the message after index i.
 *
 * The delays vary per message because a channel does not tick: the gap before a
 * reply is the time it took to read the message above it. Reduced motion jumps
 * to the end.
 */
export const useMessageCascade = (ref: RefObject<HTMLElement | null>, delays: number[]): number => {
  const [revealed, setRevealed] = useState(0);
  // Read once rather than per walk, and NOT into the initial state — the server
  // has no `matchMedia`, so seeding from it would hydrate against a different
  // number of messages.
  const [instant] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || delays.length === 0) return;

    let timer = 0;

    // Reduced motion jumps the whole thread, but still through the timer — a
    // synchronous setState in an effect body cascades renders.
    if (instant) {
      timer = window.setTimeout(() => setRevealed(delays.length), 0);
      return () => window.clearTimeout(timer);
    }

    const step = (i: number) => {
      if (i >= delays.length) return;
      timer = window.setTimeout(() => {
        setRevealed(i + 1);
        step(i + 1);
      }, delays[i]);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        step(0);
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
    // `delays` must be a STABLE array — a fresh one per render restarts the
    // walk from the top. ./slack-thread builds it once, at module scope.
  }, [ref, delays, instant]);

  return revealed;
};
