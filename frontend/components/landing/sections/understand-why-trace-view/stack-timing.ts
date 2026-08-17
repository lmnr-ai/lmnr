// Choreography for the last step: the signal card leaves the trace panel,
// becomes a stack, collapses to its cluster pill, and the pill drops into the
// clusters card that has risen to meet it.
//
// Every number here is a fraction of the CLOSING WINDOW — the slice of the
// section's scroll that runs from the third-from-last step's copy centring to
// the end of the section, i.e. the last TWO copy hand-offs. 0 = the window
// opens, 1 = it closes. Nothing here is a duration: the whole sequence is
// bound to scroll, so it rewinds frame for frame and a "slow" phase just means
// it takes more scrolling.
//
// TWO MARKS ARE LOAD-BEARING, and the phases exist to hit them:
//
//   .31  the second-to-last copy block ("Similar failures are clustered") is
//        dead centre — the stack must be fully formed and holding.
//   .62  the last block ("Has this failure occurred before?") is dead centre,
//        which is also the sticky release — the pill must already be inside the
//        clusters card.
//
//   0          .28    .44   .53 .58                          1
//   ├───────────┼──────┼─────┼───┼──────────────────────────┤
//       ▓▓▓▓▓▓▓▓                     flight    (panel → stack front)
//             ╎                      ← stack holds through .31
//             ▓▓▓▓▓                  collapse  (stack → cluster pill)
//              ▓▓▓▓▓▓▓▓              cardRise  (clusters card rises to meet it)
//                     ▓▓▓            pillEnter (pill drops into the card)
//                        ╎           ← sticky release (.62)
//                        ╎  section leaving, Act 2 playing
//
// The pinned part of this window is exactly two STEP_VH (see ./index), so
// EVERYTHING that has to happen while the frame is still pinned must fit before
// the release. Past it the section is scrolling away, so screen-space motion
// there is the element's own travel MINUS the page scroll — keep it to Act 2,
// which is time-based and does not care.
//
// Act 2 (pulse / cluster stagger / chart fill) is armed at `act2At` and then
// runs on a clock, in ms — see ../has-this-issue/use-cluster-beats.
//
// Phases are absolute and may overlap; editing one never shifts another.

export interface StackTiming {
  /** Card leaves the trace panel and flies to the front of the stack. */
  flightAt: number;
  flightSpan: number;
  /** Stack collapses into the cluster pill. */
  collapseAt: number;
  collapseSpan: number;
  /** Clusters card rises into the frame under the forming pill. */
  cardRiseAt: number;
  cardRiseSpan: number;
  /** Pill drops into the card. */
  pillEnterAt: number;
  pillEnterSpan: number;
  /** Window position at which Act 2 arms. Just after the pill is inside. */
  act2At: number;

  /** Point WITHIN the flight (0-1) where the OTHER runs start sliding in from
   *  off-frame. Late, so the flight still reads as one card arriving. */
  entryStart: number;
  /** Which slot the trace's card lands in, 0 = front. The other cards arrive
   *  from off-frame on either side of it: slots before it come down from the
   *  up-left, slots after it come up from the down-right. */
  liveSlot: number;
  /** How far out the arriving cards start, as a MULTIPLE of their slot offset.
   *  1 would mean starting already in place.
   *
   *  Note this scales OFF `dx`/`dy`, so it is not an absolute distance: at the
   *  tight-deck spacing the backmost card starts only ~48 x 80px out, well
   *  inside the frame, so the runs read as fanning out of the live card. It took
   *  the old wide spacing to put them off-frame, i.e. arriving from elsewhere.
   *  Raise this, not dx/dy, if they should come from further away. */
  entrySpread: number;
  /** Point WITHIN the flight (0-1) by which the trace panel has fully faded. */
  trayFadeEnd: number;

  /** Cascade step, front card to the one behind it, in px. */
  dx: number;
  dy: number;
  /** How far below its resting place the clusters card starts, in px. */
  cardRiseFrom: number;
  /** How far past the card's top edge the pill travels, in px — far enough to
   *  be fully hidden behind it. */
  pillEnterDepth: number;
}

export const DEFAULT_STACK_TIMING: StackTiming = {
  // Lands the formed stack at .275, so it is already holding when the copy
  // centres at .31 rather than still assembling under the reader. Starting later
  // than the window's opening beat is deliberate: the reader gets a moment on the
  // trace panel before anything leaves it.
  //
  // The span is what makes the runs fan in at a readable pace, and it can only
  // grow toward .31 — past that the stack is still assembling under its own copy.
  flightAt: 0.155,
  flightSpan: 0.12,

  // Nothing moves between .275 and .34: the stack is the picture that belongs
  // to "Similar failures are clustered", so it gets the copy's whole beat.
  collapseAt: 0.34,
  collapseSpan: 0.1,

  // Overlaps the collapse deliberately: the card is already arriving as the
  // stack folds, so the pill has somewhere to be rather than hanging.
  cardRiseAt: 0.4,
  cardRiseSpan: 0.13,

  pillEnterAt: 0.53,
  pillEnterSpan: 0.05,
  act2At: 0.585,

  entryStart: 0.4,
  // Dead centre of five: two runs arrive from the up-left, two from the
  // down-right, and the trace's own card is the one they close around.
  liveSlot: 2,
  entrySpread: 4,
  trayFadeEnd: 0.45,

  // A tight deck, not a fanned cascade. At this step the whole stack is 408 x
  // 166, so it sits INSIDE the 480-wide frame instead of bleeding off both
  // edges — see `stackLeft` in ./signal-stack, whose sign flips with this.
  dx: 6,
  dy: 10,
  cardRiseFrom: 96,
  pillEnterDepth: 56,
};

export const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Progress through one phase, given the window position. Guarded against a
 *  zero span, which a dial can produce by dragging a bar shut. */
export const phase = (t: number, at: number, span: number) => clamp01((t - at) / Math.max(span, 1e-6));

// Easing for SCROLL-BOUND travel, which is not the same problem as easing a
// timed animation. The reader owns the playhead, so their scroll speed is
// already the outer velocity envelope; an ease-OUT on top of it spends half the
// travel in the first fifth of the scroll and then crawls, which reads as the
// element getting away from you. So ease-IN-OUT is the default here and
// ease-out is the exception, the reverse of the usual rule.
//
// What linear actually costs is a velocity discontinuity at BOTH ends of every
// phase — the derivative jumps 0→v at `at` and v→0 at `at + span`. On its own
// that is a small tick; the phases here overlap deliberately, so the ticks land
// on top of each other. Pick a curve by what the motion IS:
//
//   departure from rest, arriving into formation   easeInOutCubic
//   arrival from off-frame, no prior rest state    easeOutCubic
//   transformation overlapped on BOTH sides        smootherstep
//   absorbed into occlusion                       easeInCubic
//
// Applied at the CONSUMPTION site, per property — see ./signal-stack's header.
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** Accelerates the whole way. For something being taken IN rather than coming
 *  to rest: it should look pulled, not like it is gliding to a stop. */
export const easeInCubic = (t: number) => t ** 3;

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Quintic smoothstep. Zero velocity AND zero acceleration at both ends, where
 *  the cubic only zeroes velocity — so a phase that hands off mid-motion to
 *  another has no perceptible kink at either seam. Worth the extra two
 *  multiplies only for the phases that are actually overlapped. */
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
