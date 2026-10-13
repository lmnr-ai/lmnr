import { useCallback, useEffect, useState } from "react";

// Plays 0 → endTime once and holds the last frame; `replay` restarts from 0 immediately.
export function usePlaybackTime(endTime: number) {
  const [time, setTime] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = reduceMotion ? endTime : Math.min(endTime, (now - start) / 1000);
      setTime(elapsed);
      if (elapsed < endTime) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [endTime, runId]);

  const replay = useCallback(() => setRunId((id) => id + 1), []);

  return { time, replay };
}
