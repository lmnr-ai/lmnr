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
  // The array is rebuilt every render; its CONTENTS are what the walk depends on.
  const delayKey = delays.join(",");

  useEffect(() => {
    const el = ref.current;
    if (!el || delays.length === 0) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(delays.length);
      return;
    }

    let timer = 0;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, delayKey]);

  return revealed;
};
