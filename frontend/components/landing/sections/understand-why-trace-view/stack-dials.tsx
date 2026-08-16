"use client";

import { useDialKit, useDialTimeline } from "dialkit";
import { useEffect } from "react";

import { DEFAULT_STACK_TIMING, type StackTiming } from "./stack-timing";

// Live tuning for the step-6 signal stack, DEV ONLY.
//
// The section imports this through a `process.env.NODE_ENV`-gated next/dynamic,
// so the whole dialkit chunk is dead code in a production build. Production
// always runs on DEFAULT_STACK_TIMING — once a set of numbers feels right here,
// paste them back into ./stack-timing.
//
// THE DOCK'S TIME AXIS IS NOT TIME. This animation is bound to scroll, so the
// timeline's TIMELINE_S seconds stand in for the step-6 scroll window: 1s = 10%
// of it. Drag a bar and you are moving a phase through the window, not through
// a duration.
//
// Consequently the transport is NOT wired to anything, and deliberately so —
// unlike the clusters section, this animation is ALREADY scrubbable by the one
// input that matters. Scroll IS the playhead. Adding a second one that fights
// the scroll position would only be able to disagree with it.
//
// TRAP: values persist to localStorage under `dialkit:landing-signal-stack*`,
// so reloading keeps your tuning. Once you have touched anything, the stored
// values WIN over DEFAULT_STACK_TIMING — edit ./stack-timing and nothing
// appears to change on the machine that did the tuning. Reset the panel after
// pasting numbers back, and verify the committed defaults from a clean profile.
const D = DEFAULT_STACK_TIMING;

/** Dock seconds per 1.0 of window progress. Purely a resolution choice: it
 *  makes the bars big enough to grab. */
const WINDOW_S = 10;

const toDock = (fraction: number) => fraction * WINDOW_S;
const fromDock = (seconds: number) => seconds / WINDOW_S;

interface Props {
  onChange: (timing: StackTiming) => void;
  /** Where the sticky release falls in the window, 0-1. Drawn as a reference
   *  bar so the drop can be dragged past it on purpose. */
  unpinAt: number;
}

const StackDials = ({ onChange, unpinAt }: Props) => {
  const tl = useDialTimeline(
    "Signal stack",
    {
      duration: WINDOW_S,
      flight: { at: toDock(D.flightAt), duration: toDock(D.flightSpan) },
      collapse: { at: toDock(D.collapseAt), duration: toDock(D.collapseSpan) },
      cardRise: { at: toDock(D.cardRiseAt), duration: toDock(D.cardRiseSpan) },
      pillEnter: { at: toDock(D.pillEnterAt), duration: toDock(D.pillEnterSpan) },
      // Zero-length marker: where the time-based Act 2 arms. Only its `at` is
      // read; the duration is there so there is something to grab.
      act2: { at: toDock(D.act2At), duration: toDock(0.02) },
      // READ-ONLY reference: the frame where the section stops being pinned and
      // starts scrolling away. Anything ending before it happens on a still
      // frame; anything after happens while the section is leaving. Nothing
      // reads this clip back, so dragging it does nothing.
      unpinned: { at: toDock(unpinAt), duration: toDock(1 - unpinAt) },
    },
    // Bump the -vN on EVERY default change: stored clips outrank these
    // defaults, so without it a retuned default silently does nothing on the
    // machine that last opened the dock. -v3 added the clusters card's rise and
    // the pill's entry in place of the old `drop`.
    { id: "landing-signal-stack-timeline-v3", persist: true, autoplay: false }
  );

  // Everything that is NOT a position in the window: two are fractions of the
  // flight, three are pixels.
  const panel = useDialKit(
    "Signal stack geometry",
    {
      // NOT `liveSlot`. It is a structural choice, not a tuning knob, and a
      // persisted dial silently overrides the committed default forever on
      // whichever machine touched it — changing DEFAULT_STACK_TIMING then looks
      // like it does nothing. Only put values here that you expect to tune.
      entryStart: [D.entryStart, 0, 1, 0.01],
      entrySpread: [D.entrySpread, 1, 12, 0.5],
      trayFadeEnd: [D.trayFadeEnd, 0.05, 1, 0.01],
      dx: [D.dx, 0, 160, 2],
      dy: [D.dy, 0, 200, 2],
      cardRiseFrom: [D.cardRiseFrom, 0, 320, 4],
      pillEnterDepth: [D.pillEnterDepth, 0, 200, 4],
    },
    // Bump the -vN on every default change — see the timeline's id above.
    { id: "landing-signal-stack-geometry-v2", persist: true }
  );

  const next: StackTiming = {
    flightAt: fromDock(tl.flight.at),
    flightSpan: fromDock(tl.flight.duration),
    collapseAt: fromDock(tl.collapse.at),
    collapseSpan: fromDock(tl.collapse.duration),
    cardRiseAt: fromDock(tl.cardRise.at),
    cardRiseSpan: fromDock(tl.cardRise.duration),
    pillEnterAt: fromDock(tl.pillEnter.at),
    pillEnterSpan: fromDock(tl.pillEnter.duration),
    act2At: fromDock(tl.act2.at),
    entryStart: panel.entryStart,
    liveSlot: D.liveSlot,
    entrySpread: panel.entrySpread,
    trayFadeEnd: panel.trayFadeEnd,
    dx: panel.dx,
    dy: panel.dy,
    cardRiseFrom: panel.cardRiseFrom,
    pillEnterDepth: panel.pillEnterDepth,
  };

  // Keyed on the values so dragging a bar takes effect immediately, but an
  // unrelated render doesn't. `tl.time` is not in here — it ticks every frame
  // when the transport is running and nothing reads it.
  const key = JSON.stringify(next);
  useEffect(() => {
    onChange(JSON.parse(key) as StackTiming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // No chrome here — the dock is mounted once at the landing root. See
  // ../../dial-dock.
  return null;
};

export default StackDials;
