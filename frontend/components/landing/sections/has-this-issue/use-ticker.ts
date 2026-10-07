"use client";

import { useEffect, useState } from "react";

/** Walks 0 → steps once `armed`, one step per stepMs, resetting to 0 when it
 *  goes false so a replay re-runs from empty. No viewport trigger of its own —
 *  the stage owns the schedule. rAF-driven, so it pauses with the tab. */
export function useTicker(armed: boolean, { steps, stepMs }: { steps: number; stepMs: number }): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!armed || steps <= 0) {
      setValue(0);
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(steps);
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
        setValue(next);
      }
      if (next < steps) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, steps, stepMs]);

  return value;
}
