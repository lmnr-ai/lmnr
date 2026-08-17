"use client";

import { useEffect, useState } from "react";

import { CLUSTER_COUNT } from "./clusters-card";

// Act 2 of the clusters animation: the landed cluster appears and pulses, the
// rest stagger in, the chart fills. Time-based, NOT scroll-bound — it is armed
// by a scroll position and then plays out on its own clock, so it does not
// rewind. Scrolling back past the trigger disarms it and coming down again
// replays it from the start.
//
// Shared by both stages that show the clusters card: the standalone section on
// mobile (./signal-event-clusters-mock) and the desktop trace-view scrollytell
// (../understand-why-trace-view/clusters-stage).

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
    // Disarmed: snap back to empty, ready to replay on the way back down. The
    // cluster rows animate their own height out (see ./cluster-list), so this
    // is not the hard cut it looks like.
    //
    // The write IS the point of the effect: `armed` is scroll-driven, so there
    // is no event to hang the reset on. Was masked until now by an
    // exhaustive-deps directive, which suppressed the whole hook.
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
