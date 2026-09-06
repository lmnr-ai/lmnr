// MOBILE stack choreography, every `*At`/`*Span` a fraction of the stage's
// scroll travel. Three constraints: phases OVERLAP so the collapse hands over
// where both easings are slow; the frame is only fully on screen for .30–.70;
// and the stage is not sticky, so `dropSpan` must stay under the pixel travel.
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
  /** The pill's vertical landing, as an OFFSET from the frame's centre so it
   *  survives a change to `scale`. Horizontal is NOT tunable: the pill must
   *  leave this frame on the centre line it re-enters the next one on. */
  pillOffsetY: number;
  /** How far past the bottom edge the pill travels. Overshooting is free (it is
   *  clipped); undershooting parks half a pill on the edge. */
  dropOvershoot: number;

  /** Whole-stage scale. A 384px card in a ~342px frame bleeds twice as far as
   *  the desktop one does, so the SAME dx/dy reads as a much bigger fan.
   *  Scaling buys parity; retuning dx/dy away from desktop would not. */
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
