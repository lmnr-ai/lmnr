"use client";

import { useEffect, useState } from "react";

/** Walks a counter to `limit`, one step per `stepMs`, once `enabled`. Starts at
 *  `from` and never counts back down — that would retract what the reader has
 *  already seen. Owned ABOVE the transcript, which renders its output: inside,
 *  the limit becomes a function of the rows it already produced, and stalls. */
export const useStagger = (limit: number, enabled: boolean, stepMs: number, from: number): number => {
  const [revealed, setRevealed] = useState(from);
  // Read once rather than per tick: a preference flipped mid-page should not
  // restart a reveal that is already running.
  const [instant] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (!enabled || revealed >= limit) return;
    // Reduced motion jumps the whole batch, but still through the timer — a
    // synchronous setState in an effect body cascades renders.
    const id = window.setTimeout(
      () => setRevealed((n) => (instant ? limit : Math.min(n + 1, limit))),
      instant ? 0 : stepMs
    );
    return () => window.clearTimeout(id);
  }, [revealed, limit, enabled, stepMs, instant]);

  return revealed;
};
