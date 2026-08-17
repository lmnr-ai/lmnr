// Choreography for the MOBILE signal stack (./mobile-signal-stack) — the
// collapse-into-pill and the pill's fall out through the bottom edge. Bound to
// scroll, so nothing here runs on a clock and scrolling back up rewinds it.
//
// Every `*At`/`*Span` is a FRACTION of the stage's own scroll travel: 0 = the
// frame's top edge is at the bottom of the viewport, 1 = its bottom edge has
// reached the top.
//
//   0        .25       .5       .75        1
//   ├─────────┼─────────┼─────────┼─────────┤
//             ▓▓▓▓▓                             collapse (cards → pill)
//                ▓▓▓▓▓▓                         drop     (pill → out the bottom)
//   └── entering ─┘└─ fully on screen ─┘└─ leaving ─┘
//
// THE TWO PHASES OVERLAP, on purpose: the pill starts falling while the last of
// the collapse is still closing, which is what makes it read as one continuous
// gesture rather than shrink-then-pause-then-fall. It only works because of the
// easings — `smootherstep` leaves the collapse near-stopped at its end and
// `easeInCubic` leaves the drop barely moving at its start, so the handover
// happens where both are slow. Widen the overlap much further and the cards are
// visibly still converging while already sliding off the bottom.
//
// THE FRAME IS ONLY FULLY ON SCREEN FOR THE MIDDLE THIRD. A frame this tall
// against a phone viewport means `p < 0.30` still has its bottom below the fold
// and `p > 0.70` has its top already gone, so both beats have to live inside
// that band — a collapse tuned earlier plays out half off-screen, and a drop
// tuned later throws the pill out of an edge the reader can no longer see.
//
// SCROLL PHYSICS, same as the clusters section below it: the stage is not
// sticky, so while these phases play the whole frame is travelling UP the
// screen. The drop moves the pill DOWN relative to the frame, so its on-screen
// speed is its travel MINUS the scroll its span consumes — keep `dropSpan`
// well under the pixel travel or the pill reads as hanging still while the page
// slides past it.
//
export interface MobileStackTiming {
  /** Cards converge and the live one becomes its cluster pill. */
  collapseAt: number;
  collapseSpan: number;
  /** The pill falls out through the frame's bottom edge. Deliberately starts
   *  BEFORE the collapse finishes — see the overlap note above. */
  dropAt: number;
  dropSpan: number;

  // ── Geometry, px in STAGE units (i.e. before `scale`) ──────────────────────
  /** Cascade step between stacked cards. */
  dx: number;
  dy: number;
  /** Top of the FORMATION inside the stage. Independent of where the pill lands:
   *  the card's box shrinks toward its own top-left, so the landing spot is
   *  lerped separately rather than inherited from the fan. */
  formationTop: number;
  /** The pill's vertical landing, as an OFFSET from the frame's centre.
   *  Horizontal centring is NOT tunable — the pill has to leave this frame on the
   *  same centre line it re-enters the next one on (../has-this-issue measures
   *  its own frame to centre the falling pill). Vertical has no such constraint.
   *  An offset rather than an absolute so it survives a change to `scale`. */
  pillOffsetY: number;
  /** How far past the bottom edge the pill travels. Overshooting is free (it is
   *  clipped); undershooting parks half a pill on the edge. */
  dropOvershoot: number;

  /** Whole-stage scale. The card is 384px and a phone frame is ~342, so at 1:1
   *  the card alone overflows and the cascade bleeds off the edges about twice
   *  as far as the desktop one does in its 480px frame — which is what makes
   *  the SAME dx/dy read as a much bigger fan here. Scaling is what buys desktop
   *  parity; retuning dx/dy away from the desktop config would not. */
  scale: number;
}

export const DEFAULT_MOBILE_STACK_TIMING: MobileStackTiming = {
  collapseAt: 0.3,
  collapseSpan: 0.16,
  // Overlaps the last third of the collapse.
  dropAt: 0.4,
  dropSpan: 0.2,

  // A far tighter fan than the desktop config's 56/76 — at this scale, in a frame
  // this short, that cascade runs most of its cards off the edges. Tuned here
  // rather than derived from desktop's.
  dx: 8,
  dy: 14,

  // Centres the formation: the stage is FRAME_H / scale = 500 tall and the fan is
  // one card (126) plus 4 × dy = 182, so the top sits at (500 - 182) / 2. Re-derive
  // it after any change to `scale` or `dy`.
  formationTop: 160,
  pillOffsetY: 0,
  dropOvershoot: 150,

  scale: 0.72,
};
