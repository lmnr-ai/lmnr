"use client";

import { type RefObject, useEffect, useState } from "react";

// Plays forward from 0 and never wraps: stages settle into their end state while
// spinners and ambient bits keep moving. Pauses off screen; reduced motion holds `settledTime`.
export const usePlaybackTime = (ref: RefObject<HTMLElement | null>, settledTime: number) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let elapsed = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (reduceMotion) {
        setTime(settledTime);
        return;
      }
      elapsed += last === null ? 0 : (now - last) / 1000;
      last = now;
      setTime(elapsed);
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      last = null;
      if (entry.isIntersecting) frame = requestAnimationFrame(tick);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, settledTime]);

  return time;
};
