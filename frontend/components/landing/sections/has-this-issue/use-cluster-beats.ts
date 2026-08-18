"use client";

import { useEffect, useState } from "react";

import { CLUSTER_COUNT } from "./clusters-card";

// Act 2: the landed cluster pulses, the rest stagger in, the chart fills. Armed
// by a scroll position but played on its own clock, so it REPLAYS rather than
// rewinding. Shared by both stages that show the clusters card.

// One flag per track. Each is flipped by its own absolute timer, so tracks are
// independent and free to overlap — there is no phase counter forcing them
// into sequence.
export interface ClusterBeats {
  /** The pill is inside the card: its cluster gains its events. */
  landed: boolean;
  /** Clusters discovered so far; "Unclustered Events" is not counted. */
  revealed: number;
  pulsing: boolean;
  chartArmed: boolean;
}

export interface ClusterBeatTiming {
  landedAt: number;
  pulseMs: number;
  revealAt: number;
  revealStagger: number;
  revealMs: number;
  chartAt: number;
}

const AT_REST: ClusterBeats = { landed: false, revealed: 0, pulsing: false, chartArmed: false };
const SETTLED: ClusterBeats = { landed: true, revealed: CLUSTER_COUNT, pulsing: false, chartArmed: true };

export const useClusterBeats = (armed: boolean, timing: ClusterBeatTiming): ClusterBeats => {
  const [beats, setBeats] = useState<ClusterBeats>(AT_REST);

  useEffect(() => {
    // Disarmed: snap back to empty, ready to replay. Not the hard cut it looks
    // like — the rows animate their own height out. The write IS the point of
    // the effect: `armed` is scroll-driven, with no event to hang a reset on.
    if (!armed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBeats(AT_REST);
      return;
    }

    setBeats(AT_REST);

    // Act 1 is left scrubbing even here — it is driven by the reader's own
    // scroll, so it is not motion they did not ask for. This is, so it lands
    // in one frame instead.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setBeats(SETTLED);
      return;
    }

    const t = timing;
    // Every time below is absolute from this moment, so tracks may overlap.
    const at = (ms: number, patch: Partial<ClusterBeats>) =>
      setTimeout(() => setBeats((prev) => ({ ...prev, ...patch })), ms);

    const timers = [
      // The pill's landing IS the cluster appearing, so both fire together.
      at(t.landedAt, { landed: true, revealed: 1, pulsing: true }),
      at(t.landedAt + t.pulseMs, { pulsing: false }),
      // Clusters 2..N. Each keeps `revealed` monotonic via Math.max so an
      // out-of-order schedule (a stagger behind `landedAt`) can't un-reveal a
      // row that is already on screen.
      ...Array.from({ length: CLUSTER_COUNT - 1 }, (_, i) => {
        const n = i + 2;
        return setTimeout(
          () => setBeats((prev) => ({ ...prev, revealed: Math.max(prev.revealed, n) })),
          t.revealAt + i * t.revealStagger
        );
      }),
      at(t.chartAt, { chartArmed: true }),
    ];
    return () => timers.forEach(clearTimeout);
  }, [armed, timing]);

  return beats;
};
