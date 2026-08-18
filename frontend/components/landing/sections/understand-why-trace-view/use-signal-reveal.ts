"use client";

import { useEffect, useState } from "react";

// Dim, scan, then hand up the card. Wall-clock rather than scrubbed: the step
// that arms this is a discrete latch, so there is no scroll coordinate to scrub
// against — and the reader gets ~40vh of scroll before the flight needs the card
// measured, which is the ceiling every number below is set under.

/** The dim runs first and alone: the panel has to settle into "something is
 *  being looked at" before anything looks. Mirrors DIM_CLS in ./trace-panel. */
const SCAN_AT = 200;

export const SCAN_MS = 1150;

/** The card opens with the band's last fifth still running, so the sweep hands
 *  it up rather than finishing and leaving a beat where nothing moves. */
const CARD_AT = 1160;

/** Arms on `armed`; `skip` jumps straight to the open card for the paths with
 *  no beat to spend — a static mobile crop, or a reader who scrolled into the
 *  flight before the sequence could finish. */
export const useSignalReveal = (armed: boolean, skip: boolean) => {
  const [scanning, setScanning] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  // Read once rather than per run: a preference flipped mid-page should not
  // restart a sequence that is already playing.
  const [instant] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    // Every branch goes through a timer, including the immediate ones: a
    // synchronous setState in an effect body cascades renders.
    if (!armed) {
      const id = window.setTimeout(() => {
        setScanning(false);
        setCardOpen(false);
      }, 0);
      return () => window.clearTimeout(id);
    }

    if (skip || instant) {
      const id = window.setTimeout(() => {
        setScanning(false);
        setCardOpen(true);
      }, 0);
      return () => window.clearTimeout(id);
    }

    const timers = [
      window.setTimeout(() => setScanning(true), SCAN_AT),
      window.setTimeout(() => setCardOpen(true), CARD_AT),
      window.setTimeout(() => setScanning(false), SCAN_AT + SCAN_MS),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [armed, skip, instant]);

  return { scanning, cardOpen };
};
