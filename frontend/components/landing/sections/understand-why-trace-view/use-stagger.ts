"use client";

import { useEffect, useState } from "react";

/** Walks a counter up to `limit`, one step per `stepMs`, once `enabled`.
 *  Starts at `from` rather than 0, and never counts back down: a step that
 *  lowered the cap would retract what the reader has already seen arrive.
 *
 *  Lives above the transcript rather than inside it because its output is what
 *  the trace-view store is filled from, and the store is what BOTH the
 *  transcript and the condensed timeline read. Owning it in the transcript made
 *  the limit a function of the rows the store had already produced, which is a
 *  loop: reveal 3, store holds 3, limit becomes 3, counter stops. */
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
