// Choreography for the last step: the signal card leaves the trace panel,
// becomes a stack, collapses to its cluster pill, and the pill drops into the
// clusters card that has risen to meet it.
//
// Every number here is a fraction of the LAST-STEP WINDOW — the slice of the
// section's scroll that runs from the previous step's copy centring to the end
// of the section. 0 = the window opens, 1 = it closes. Nothing here is a
// duration: the whole sequence is bound to scroll, so it rewinds frame for
// frame and a "slow" phase just means it takes more scrolling.
//
//   0      .08      .18    .30  .375                        1
//   ├───────┼────────┼──────┼────┼─────────────────────────┤
//     ▓▓▓                              flight    (panel → stack front)
//          ▓▓▓▓▓▓▓                     collapse  (stack → cluster pill)
//            ▓▓▓▓▓▓▓▓▓                 cardRise  (clusters card rises to meet it)
//                    ▓▓▓               pillEnter (pill drops into the card)
//                      ╎               ← sticky release (.375)
//                      ╎  section leaving, Act 2 playing
//
// The sticky tail is exactly one STEP_VH (see ./index), so EVERYTHING that has
// to happen while the frame is still pinned must fit before the release. Past
// it the section is scrolling away, so screen-space motion there is the
// element's own travel MINUS the page scroll — keep it to Act 2, which is
// time-based and does not care.
//
// Act 2 (pulse / cluster stagger / chart fill) is armed at `act2At` and then
// runs on a clock, in ms — see ../has-this-issue/use-cluster-beats.
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
   *  1 would mean starting already in place; large enough and they begin
   *  outside the frame, which is the point — they come from elsewhere rather
   *  than out of the live card. */
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
  flightAt: 0.02,
  flightSpan: 0.08,

  collapseAt: 0.11,
  collapseSpan: 0.13,

  // Overlaps the collapse deliberately: the card is already arriving as the
  // stack folds, so the pill has somewhere to be rather than hanging.
  cardRiseAt: 0.16,
  cardRiseSpan: 0.15,

  pillEnterAt: 0.31,
  pillEnterSpan: 0.055,
  act2At: 0.355,

  entryStart: 0.35,
  // Dead centre of five: two runs arrive from the up-left, two from the
  // down-right, and the trace's own card is the one they close around.
  liveSlot: 2,
  entrySpread: 4,
  trayFadeEnd: 0.45,

  dx: 56,
  dy: 76,
  cardRiseFrom: 72,
  pillEnterDepth: 56,
};

export const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Progress through one phase, given the window position. Guarded against a
 *  zero span, which a dial can produce by dragging a bar shut. */
export const phase = (t: number, at: number, span: number) => clamp01((t - at) / Math.max(span, 1e-6));

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
