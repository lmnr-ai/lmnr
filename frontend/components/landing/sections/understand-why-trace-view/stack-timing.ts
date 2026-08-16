// Choreography for the step-6 signal stack.
//
// Every number here is a fraction of the STEP-6 WINDOW — the slice of the
// section's scroll that runs from step 5's copy centring to the section
// unpinning. 0 = the window opens, 1 = it closes. Nothing here is a duration
// in time: the whole sequence is bound to scroll, so it rewinds frame for
// frame and a "slow" phase just means it takes more scrolling.
//
//   0        .25       .5      .63        1
//   ├─────────┼─────────┼───────┼─────────┤
//     ▓▓▓                                     flight   (panel → stack front)
//          ▓▓▓▓▓▓▓                            collapse (stack → cluster pill)
//                  ▓▓▓▓▓▓▓▓▓                  drop     (pill leaves the frame)
//                          ╎                  ← sticky release (~.63)
//               pinned     ╎  section leaving
//
// The window deliberately runs PAST the sticky release, so the drop can still
// be finishing as the section starts to scroll away rather than ending on a
// still frame with an empty panel. Everything after the release plays while the
// whole section is moving up, so keep it short — screen-space motion there is
// the drop MINUS the page scroll, and a long tail reads as the pill hanging.
//
// Phases are absolute and may overlap; editing one never shifts another.
// Tunable live in dev via ./stack-dials (DialKit). Numbers arrived at there get
// pasted back into DEFAULTS — nothing reads the dials in production.

export interface StackTiming {
  /** Card leaves the trace panel and flies to the front of the stack. */
  flightAt: number;
  flightSpan: number;
  /** Stack collapses into the cluster pill. */
  collapseAt: number;
  collapseSpan: number;
  /** Pill drops out through the bottom edge. */
  dropAt: number;
  dropSpan: number;

  /** Point WITHIN the flight (0-1) where the OTHER runs start sliding in from
   *  off-frame. Late, so the flight still reads as one card arriving. */
  entryStart: number;
  /** Which slot the trace's card lands in, 0 = front. The other cards arrive
   *  from off-frame on either side of it: slots before it come down from the
   *  up-left, slots after it come up from the down-right. */
  liveSlot: number;
  /** How far out the arriving cards start, as a MULTIPLE of their slot offset.
   *  1 would mean starting already in place; large enough and they begin
   *  outside the frame, which is the point — they come from elsewhere rather
   *  than out of the live card. */
  entrySpread: number;
  /** Point WITHIN the flight (0-1) by which the trace panel has fully faded. */
  trayFadeEnd: number;

  /** Cascade step, front card to the one behind it, in px. */
  dx: number;
  dy: number;
  /** How far past the frame's bottom edge the pill travels, in px. */
  dropClearance: number;
}

// The flight sits where the step 5 → 6 tray ramp would have put it; the
// collapse follows after a beat; the drop starts while the stack is still
// settling and ends just past the sticky release (~0.63).
export const DEFAULT_STACK_TIMING: StackTiming = {
  flightAt: 0.06,
  flightSpan: 0.1,

  collapseAt: 0.21,
  collapseSpan: 0.19,

  dropAt: 0.42,
  dropSpan: 0.26,

  entryStart: 0.35,
  // Dead centre of five: two runs arrive from the up-left, two from the
  // down-right, and the trace's own card is the one they close around.
  liveSlot: 2,
  entrySpread: 4,
  trayFadeEnd: 0.45,

  dx: 56,
  dy: 76,
  dropClearance: 40,
};

export const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Progress through one phase, given the window position. Guarded against a
 *  zero span, which a dial can produce by dragging a bar shut. */
export const phase = (t: number, at: number, span: number) => clamp01((t - at) / Math.max(span, 1e-6));
