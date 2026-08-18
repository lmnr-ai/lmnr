// Every number is a fraction of the CLOSING WINDOW (the last two copy
// hand-offs), not a duration; phases are absolute and may overlap. Two marks are
// load-bearing: the stack must be formed by .31 and the pill inside the clusters
// card by .62, which is also the sticky release.

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
   *  off-frame. Not at 0, so the flight opens as one card leaving one panel
   *  before it becomes a pile. */
  entryStart: number;
  /** Which slot the trace's card lands in, 0 = front. The other cards arrive
   *  from off-frame on either side of it: slots before it come down from the
   *  up-left, slots after it come up from the down-right. */
  liveSlot: number;
  /** How far out arriving cards start, as a MULTIPLE of their slot offset (1 =
   *  already in place). Scales off `dx`/`dy`, so at tight spacing they fan out
   *  of the live card rather than arriving from off-frame. Raise THIS, not
   *  dx/dy, to bring them from further away. */
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
  // Set against the 80vh step the gesture plays over: the card leaves at 12% of
  // it and the stack is complete at 95%, landing just as its caption centres
  // rather than sitting formed and waiting.
  flightAt: 0.037,
  flightSpan: 0.255,

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

  entryStart: 0.25,
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

// Easing for SCROLL-BOUND travel: the reader's scroll is already the velocity
// envelope, so ease-IN-OUT is the default and ease-out the exception — the
// reverse of the usual rule. Pick by what the motion IS: into formation →
// easeInOutCubic, from off-frame → easeOutCubic, overlapped → smootherstep.
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
