"use client";

import { useDialKit, useDialTimeline } from "dialkit";
import { useEffect } from "react";

import { DEFAULT_MOBILE_STACK_TIMING, type MobileStackTiming } from "./mobile-stack-timing";

// Live tuning for the MOBILE signal stack, DEV ONLY.
//
// ./mobile-signal-stack imports this through a `process.env.NODE_ENV`-gated
// next/dynamic, so the whole dialkit chunk is dead code in a production build.
// Production always runs on DEFAULT_MOBILE_STACK_TIMING — once a set of numbers
// feels right here, paste them back into ./mobile-stack-timing.
//
// ONLY VISIBLE AT A PHONE WIDTH. The stack it drives is inside the `md:hidden`
// tree, so above 768px the component is not mounted and these panels are not
// registered — narrow the window first or the dock will not show them.
//
// THE TIME AXIS IS NOT TIME. This animation is bound to scroll, so the
// timeline's WINDOW_S seconds stand in for the stage's scroll travel: 1s = 10%
// of it. Dragging a bar moves a phase through the window, not through a
// duration. The transport is deliberately NOT wired to anything — scroll is
// already the playhead, and a second one could only disagree with it.
//
// The read-only `onScreen` bar marks the stretch where the frame is FULLY
// visible. Both phases belong inside it; see ./mobile-stack-timing for why.
//
// TRAP: values persist to localStorage under `dialkit:landing-mobile-stack*`, so
// reloading keeps your tuning, and once you have touched anything the stored
// values WIN over the committed defaults — edit ./mobile-stack-timing and
// nothing appears to change on the machine that did the tuning. Bump the -vN on
// every default change, reset the panel after pasting numbers back, and verify
// from a clean profile.
const D = DEFAULT_MOBILE_STACK_TIMING;

/** Dock seconds per 1.0 of scroll-window progress. Purely a resolution choice:
 *  it makes the bars big enough to grab. */
const WINDOW_S = 10;

/** The stretch where a FRAME_H-tall frame is fully on screen, for a phone
 *  viewport. Drawn as a reference bar; nothing reads it back. */
const ON_SCREEN_FROM = 0.3;
const ON_SCREEN_TO = 0.7;

const toWindow = (fraction: number) => fraction * WINDOW_S;
const fromWindow = (seconds: number) => seconds / WINDOW_S;

interface Props {
  onChange: (timing: MobileStackTiming) => void;
}

const MobileStackDials = ({ onChange }: Props) => {
  const tl = useDialTimeline(
    "Mobile signal stack (scroll)",
    {
      duration: WINDOW_S,
      collapse: { at: toWindow(D.collapseAt), duration: toWindow(D.collapseSpan) },
      drop: { at: toWindow(D.dropAt), duration: toWindow(D.dropSpan) },
      // READ-ONLY reference. Nothing reads this clip back, so dragging it does
      // nothing — it is here to show where the frame is actually visible.
      onScreen: { at: toWindow(ON_SCREEN_FROM), duration: toWindow(ON_SCREEN_TO - ON_SCREEN_FROM) },
    },
    { id: "landing-mobile-stack-timeline-v2", persist: true, autoplay: false }
  );

  const panel = useDialKit(
    "Mobile stack geometry",
    {
      // Scale first: it changes what every px below is worth on screen.
      scale: [D.scale, 0.4, 1, 0.02],
      // Finer steps than the desktop panel's — the tuned fan is single digits.
      dx: [D.dx, 0, 80, 1],
      dy: [D.dy, 0, 120, 1],
      formationTop: [D.formationTop, 0, 320, 4],
      // Vertical only. There is no horizontal counterpart on purpose — see
      // `pillOffsetY` in ./mobile-stack-timing.
      pillOffsetY: [D.pillOffsetY, -240, 240, 4],
      dropOvershoot: [D.dropOvershoot, 0, 400, 10],
    },
    { id: "landing-mobile-stack-geometry-v2", persist: true }
  );

  const next: MobileStackTiming = {
    collapseAt: fromWindow(tl.collapse.at),
    collapseSpan: fromWindow(tl.collapse.duration),
    dropAt: fromWindow(tl.drop.at),
    dropSpan: fromWindow(tl.drop.duration),
    dx: panel.dx,
    dy: panel.dy,
    formationTop: panel.formationTop,
    pillOffsetY: panel.pillOffsetY,
    dropOvershoot: panel.dropOvershoot,
    scale: panel.scale,
  };

  // Keyed on the values so dragging a bar takes effect immediately, but an
  // unrelated render doesn't. `tl.time` is not in here — it ticks every frame
  // when the transport runs and nothing reads it.
  const key = JSON.stringify(next);
  useEffect(() => {
    onChange(JSON.parse(key) as MobileStackTiming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // No chrome here — the dock is mounted once at the landing root. See
  // ../../dial-dock.
  return null;
};

export default MobileStackDials;
