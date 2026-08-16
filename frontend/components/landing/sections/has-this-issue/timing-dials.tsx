"use client";

import { useDialKit, useDialTimeline } from "dialkit";
import { useEffect, useRef } from "react";

import { CLUSTER_FILL_MS } from "./clusters-card";
import { type ClustersTiming, DEFAULT_TIMING } from "./timing";

// Live tuning for the clusters animation, DEV ONLY.
//
// The stage imports this through a `process.env.NODE_ENV`-gated next/dynamic,
// so the whole dialkit chunk is dead code in a production build. Production
// always runs on DEFAULT_TIMING — once a set of numbers feels right here, paste
// them back into ./timing.
//
// THREE surfaces, split by what the value IS:
//   • the ACT 1 timeline, whose seconds are NOT time. Act 1 is bound to scroll,
//     so its WINDOW_S seconds stand in for the scroll window: 1s = 10% of it.
//     Drag a bar and you are moving a phase through the window.
//   • the ACT 2 timeline, whose seconds ARE time — that act runs on wall-clock
//     timers once Act 1 hands off. Authoring overlap is the whole reason both
//     are here: drag two bars over each other and the tracks overlap.
//   • the PANEL, for the values that are neither (pixel offsets, and the gap
//     between the staggered cluster rows).
//
// The Act 1 transport is deliberately NOT wired to anything: that act is
// ALREADY scrubbable by the one input that matters, and scroll IS its playhead.
// The Act 2 transport IS wired, but only as a replay — starting it from zero
// re-runs the real animation. Dragging its playhead moves the bars, not the
// pill; the stage runs the choreography off real timers so dev and production
// animate through exactly the same code, and DialKit only supplies numbers.
//
// TRAP: values persist to localStorage under `dialkit:landing-clusters-*`, so
// reloading keeps your tuning. Once you have touched anything, the stored
// values WIN over DEFAULT_TIMING — edit ./timing and nothing appears to change
// on the machine that did the tuning. Reset the panel after pasting numbers
// back, and verify the committed defaults from a clean profile. (This is also
// why every id below carries the act it belongs to: the ids changed when the
// animation was split into two acts, which retires the stale stored clips
// rather than half-restoring them onto the new ones.)
const D = DEFAULT_TIMING;

/** Dock seconds per 1.0 of Act 1's scroll-window progress. Purely a resolution
 *  choice: it makes the bars big enough to grab. */
const WINDOW_S = 10;
/** Length of Act 2's scrubbable timeline, in real seconds. Not a limit the
 *  animation enforces — raise it if a track needs to start later than this. */
const ACT2_S = 4;

const toWindow = (fraction: number) => fraction * WINDOW_S;
const fromWindow = (seconds: number) => seconds / WINDOW_S;
const toSeconds = (ms: number) => ms / 1000;
const toMs = (seconds: number) => Math.round(seconds * 1000);

interface Props {
  onChange: (timing: ClustersTiming) => void;
  onReplay: () => void;
}

const TimingDials = ({ onChange, onReplay }: Props) => {
  // TODO(production): remove DialKit from this section before shipping. There is
  // nothing to convert — every clip below is a MARKER (`at` + `duration`, no
  // `from`/`to`), so DialKit supplies numbers and renders nothing. Handoff is
  // just: paste the tuned numbers into ./timing, then delete this file, its
  // next/dynamic import in ../signal-event-clusters-mock, and the dialkit
  // devDependency.
  const act1 = useDialTimeline(
    "Clusters · Act 1 (scroll)",
    {
      duration: WINDOW_S,
      pillFall: { at: toWindow(D.pillFallAt), duration: toWindow(D.pillFallSpan) },
      clusterRise: { at: toWindow(D.clusterRiseAt), duration: toWindow(D.clusterRiseSpan) },
      pillEnter: { at: toWindow(D.pillEnterAt), duration: toWindow(D.pillEnterSpan) },
      // Hand-off marker: only its START is read. The bar runs to the end of the
      // window purely so it is visible as "from here on, Act 2 is armed".
      act2Armed: { at: toWindow(D.act2At), duration: toWindow(1 - D.act2At) },
    },
    // -v3: stored clips outrank DEFAULT_TIMING, so bumping the id is the ONLY
    // way a committed retune reaches a machine that has already loaded this
    // dock — editing ./timing alone looks like it does nothing there. Bump it
    // every time the Act 1 defaults change. (v2 was the first retune, v3 the
    // reflow onto a 540px frame.)
    { id: "landing-clusters-act1-v3", persist: true, autoplay: false }
  );

  const act2 = useDialTimeline(
    "Clusters · Act 2 (time)",
    {
      duration: ACT2_S,
      landedCluster: { at: toSeconds(D.landedAt), duration: toSeconds(D.pulseMs) },
      // The bar covers the FIRST of the three staggered rows; `revealStagger` on
      // the panel spaces the other two out behind it.
      otherClusters: { at: toSeconds(D.revealAt), duration: toSeconds(D.revealMs) },
      // Fill length is derived from the dataset, so this bar's duration is
      // display-only — resizing it changes nothing.
      chart: { at: toSeconds(D.chartAt), duration: toSeconds(CLUSTER_FILL_MS) },
    },
    { id: "landing-clusters-act2", persist: true, autoplay: false }
  );

  const panel = useDialKit(
    "Clusters geometry",
    {
      pillFallFrom: [D.pillFallFrom, 0, 480, 10],
      pillOverhang: [D.pillOverhang, 0, 120, 2],
      dropOvershoot: [D.dropOvershoot, 0, 120, 2],
      clusterRiseFrom: [D.clusterRiseFrom, 0, 320, 4],
      revealStagger: [D.revealStagger, 0, 1000, 10],
    },
    // Bumped alongside the Act 1 timeline — pillFallFrom and pillOverhang were
    // both retuned for the 540px frame. Same trap, same fix.
    { id: "landing-clusters-geometry-v3", persist: true }
  );

  // Starting the Act 2 transport from zero — the dock's play button, or
  // scrubbing back to the start — re-runs the real animation, so the playhead
  // and the stage set off together. Act 1 has no equivalent; scroll replays it.
  const prev = useRef({ time: act2.time, playing: act2.playing });
  useEffect(() => {
    const wentBackwards = act2.time < prev.current.time;
    const startedFromTop = act2.playing && !prev.current.playing && act2.time < 0.05;
    prev.current = { time: act2.time, playing: act2.playing };
    if (wentBackwards || startedFromTop) onReplay();
  }, [act2.time, act2.playing, onReplay]);

  const next: ClustersTiming = {
    pillFallAt: fromWindow(act1.pillFall.at),
    pillFallSpan: fromWindow(act1.pillFall.duration),
    clusterRiseAt: fromWindow(act1.clusterRise.at),
    clusterRiseSpan: fromWindow(act1.clusterRise.duration),
    pillEnterAt: fromWindow(act1.pillEnter.at),
    pillEnterSpan: fromWindow(act1.pillEnter.duration),
    act2At: fromWindow(act1.act2Armed.at),

    pillFallFrom: panel.pillFallFrom,
    pillOverhang: panel.pillOverhang,
    dropOvershoot: panel.dropOvershoot,
    clusterRiseFrom: panel.clusterRiseFrom,

    landedAt: toMs(act2.landedCluster.at),
    pulseMs: toMs(act2.landedCluster.duration),
    revealAt: toMs(act2.otherClusters.at),
    revealStagger: panel.revealStagger,
    revealMs: toMs(act2.otherClusters.duration),
    chartAt: toMs(act2.chart.at),
  };

  // Keyed on the values so dragging a bar re-runs the schedule (which is the
  // point — you want to see the change immediately), but an unrelated render
  // doesn't. `*.time` ticks every frame while playing; it is not in here.
  const key = JSON.stringify(next);
  useEffect(() => {
    onChange(JSON.parse(key) as ClustersTiming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // No chrome here — the dock is mounted once at the landing root. See
  // ../../dial-dock.
  return null;
};

export default TimingDials;
