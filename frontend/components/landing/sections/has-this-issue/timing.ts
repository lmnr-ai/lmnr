// Two clocks: Act 1's `*At`/`*Span` are fractions of the stage's scroll window
// and rewind, Act 2's are absolute ms and replay. The section is NOT sticky, so
// keep each pill phase's scroll span under HALF its pixel travel or it reads as
// hanging still — and TOP_LANE caps the visible fall, not `pillFallFrom`.
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
  /** Where Act 2 is armed. BEFORE the end of `pillEnter`, so the cluster
   *  appears as the pill disappears rather than after a dead frame. */
  act2At: number;

  // ── Act 1 geometry, px ────────────────────────────────────────────────────
  /** How far above its resting place the pill starts. Must clear the panel's
   *  top edge, with room to spare — see the scroll-physics note above. */
  pillFallFrom: number;
  /** Card's top edge up to the PILL'S TOP at rest, not the gap under it. Below
   *  the pill's own height it parks partly behind the card. */
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

  // Only the last ~76px clears the frame's edge; the rest is lead-in, so the
  // pill is already moving when it appears rather than materialising at rest.
  pillFallFrom: 140,
  // The pill's own height (28) plus a 16px gap. Every px above it is a px the
  // fall does not get.
  pillOverhang: 44,
  dropOvershoot: 40,
  clusterRiseFrom: 64,

  landedAt: 0,
  pulseMs: 520,

  revealAt: 321,
  revealStagger: 180,
  revealMs: 320,

  chartAt: 321,
};

/** Standard-ease out. Used for everything that settles into place. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Slightly sharper — the pill dropping behind the card should feel decisive. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Progress through one phase, given the window position. Guarded against a
 *  zero span, which a dial can produce by dragging a bar shut. */
export const phase = (t: number, at: number, span: number) => clamp01((t - at) / Math.max(span, 1e-6));

// Scalar twins of the beziers above: a MotionValue lerp cannot take one the way
// a `transition` can, so scroll-bound phases shape themselves in the transform.
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
