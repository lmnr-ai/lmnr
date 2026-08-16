// Choreography for the clusters animation. TWO ACTS, on two different clocks.
//
// ACT 1 — bound to scroll, reversible.
// Every `*At`/`*Span` below is a FRACTION of the stage's entry window (0 = the
// stage's top edge is three quarters of the way down the viewport, 1 = the
// stage is centred in it). Nothing runs on a timer, so scrolling back up
// rewinds it frame for frame, exactly like the trace section above.
//
//   0        .25       .5       .75        1
//   ├─────────┼─────────┼─────────┼─────────┤
//    ▓▓▓                                       pillFall    (in from above)
//        ▓▓▓▓▓▓▓▓▓▓▓                           clusterRise (up from below)
//                              ▓▓▓             pillEnter   (down into the card)
//                            ╎                 ← Act 2 arms here
//
// The window deliberately does NOT open the moment the stage clears the bottom
// of the viewport. It used to, and the whole fall then played out in the last
// 40px of the screen, where it read as the pill simply appearing above the
// card. Act 1 now starts once the panel is properly in view.
//
// ACT 2 — wall clock, one-shot.
// `landedAt` and friends are absolute ms measured from the moment Act 1 arms
// Act 2, and are free to overlap. It does NOT rewind with the scroll: scrolling
// back up disarms and resets it, scrolling back down replays it from the top.
// That split is deliberate — the clusters appearing is a discovery, and a
// discovery played backwards under the scrollbar reads as a glitch.
//
//   0         1000      2000
//   ├─────────┼─────────┼──▶
//   ▓▓▓▓▓                     landedCluster (+ pulse)
//              ▓▓▓▓▓▓▓        otherClusters (×3, staggered)
//              ▓▓▓▓▓▓▓▓▓      chart
//
// SCROLL PHYSICS, and why the pill phases are so short. The section is NOT
// sticky, so while Act 1 plays the whole stage is travelling up the screen.
// Anything moving DOWN relative to the stage (both pill phases) is fighting
// that: its on-screen motion is its travel MINUS the scroll the phase consumes.
// A fall of 172 visible px over a 172px span of scroll does not read as a fall
// at all — it reads as the pill hanging still while everything slides past it,
// which is exactly the bug these numbers were tuned to kill. Rule of thumb:
// keep each pill phase's scroll span under HALF its pixel travel. Anything
// moving UP relative to the stage (the clusters card rising) is helped by the
// scroll instead, and needs no such care.
//
// The pill's runway is the other half of that. It falls from above the section
// panel's `overflow-hidden` edge, so the VISIBLE part of the fall is capped by
// how much empty panel sits above the clusters card — see TOP_LANE in
// ../signal-event-clusters-mock. Lengthening `pillFallFrom` past that only adds
// invisible lead-in; the lane is what has to grow.
//
// Tunable live in dev via ./timing-dials (DialKit). Numbers arrived at there get
// pasted back into DEFAULTS — nothing reads the dials in production.
export interface ClustersTiming {
  // ── Act 1: positions in the scroll window, 0-1 ────────────────────────────
  /** Pill falls in from above the panel to its resting place over the card. */
  pillFallAt: number;
  pillFallSpan: number;
  /** Clusters card rises into place and fades in. */
  clusterRiseAt: number;
  clusterRiseSpan: number;
  /** Pill drops down into the card. The gap between this and the end of
   *  `pillFall` is the beat where the pill hangs above the card. */
  pillEnterAt: number;
  pillEnterSpan: number;
  /** Where Act 2 is armed. Deliberately BEFORE the end of `pillEnter`, so the
   *  cluster appears as the pill is disappearing into the card rather than
   *  after a dead frame. */
  act2At: number;

  // ── Act 1 geometry, px ────────────────────────────────────────────────────
  /** How far above its resting place the pill starts. Must clear the panel's
   *  top edge (the section's `overflow-hidden`) so the pill is invisible until
   *  it drops in — and see the scroll-physics note above for why "just enough
   *  to clear it" is not enough. */
  pillFallFrom: number;
  /** Distance from the clusters card's top edge up to the PILL'S TOP, at rest —
   *  NOT the gap under the pill. Below the pill's own height it parks partly
   *  behind the card. */
  pillOverhang: number;
  /** Extra px past the card's top edge, so the pill ends up fully behind it. */
  dropOvershoot: number;
  /** How far below its resting place the clusters card starts. */
  clusterRiseFrom: number;

  // ── Act 2: ms from the moment Act 1 arms it ───────────────────────────────
  /** The cluster the pill landed in appears, and pulses. */
  landedAt: number;
  pulseMs: number;
  /** The SECOND cluster appears; the third and fourth follow one stagger apart. */
  revealAt: number;
  revealStagger: number;
  /** How long each cluster row takes to unfold into the list. */
  revealMs: number;
  /** Bars start streaming in. Every count climbs with them. */
  chartAt: number;
}

// Note `chartAt === revealAt`: the bars stream in WHILE the remaining clusters
// are still unfolding, which is the overlap the absolute schedule exists to
// allow.
export const DEFAULT_TIMING: ClustersTiming = {
  pillFallAt: 0.04,
  pillFallSpan: 0.07,

  clusterRiseAt: 0.16,
  clusterRiseSpan: 0.34,

  pillEnterAt: 0.72,
  pillEnterSpan: 0.1,
  act2At: 0.8,

  // Only the last ~76px of the fall clears the frame's top edge; the rest is
  // invisible lead-in that exists so the pill is already moving when it
  // appears, rather than materialising at rest.
  pillFallFrom: 140,
  // Measured from the pill's TOP, so anything below the pill's own height (28)
  // parks it partly behind the card. This is the floor plus a 16px gap, and
  // every px above it is a px the fall does not get.
  pillOverhang: 44,
  dropOvershoot: 40,
  clusterRiseFrom: 64,

  landedAt: 0,
  pulseMs: 520,

  revealAt: 1070,
  revealStagger: 180,
  revealMs: 320,

  chartAt: 1070,
};

/** Standard-ease out. Used for everything that settles into place. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Slightly sharper — the pill dropping behind the card should feel decisive. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Progress through one phase, given the window position. Guarded against a
 *  zero span, which a dial can produce by dragging a bar shut. */
export const phase = (t: number, at: number, span: number) => clamp01((t - at) / Math.max(span, 1e-6));

// Scalar twins of the cubic-bezier curves above, for the scroll-bound phases.
// A MotionValue lerp cannot take a bezier the way a `transition` can, so the
// shaping has to happen inside the transform.
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
