// Geometry of the right-hand column.
//
// The frame is a window of fixed HEIGHT holding ONE trace panel, centred:
//
//   frame:  ┌───────────────┐
//           │  [  trace  ]  │
//           └───────────────┘
//
// Its WIDTH is a media query (see ./index), so NOTHING here may derive from
// one. Horizontal placement is CSS centring wherever it can be — and where a
// number is genuinely needed, because the value is lerped against a measured
// box, the consumer measures the frame itself (see ./signal-stack).

export const FRAME_H = 760;

export const PANEL_W = 400;
export const PANEL_H = 680;

/** The panel is a bordered card, so its outer width is 2px wider than its
 *  content. Counted here so the centring is exact rather than 2px off. */
const PANEL_BORDER = 2;

/** Width of the frame's edge vignettes. Exactly the panel's resting margin, so
 *  they sit over bare frame background and only bite on the signal stack's
 *  cascade, which is wider than the frame and bleeds off both edges.
 *
 *  A calc against the frame's own width rather than a number: the margin is
 *  half of whatever the media query leaves over. */
export const EDGE_FADE_W = `calc((100% - ${PANEL_W + PANEL_BORDER}px) / 2)`;

/** Gap between the resting pill and the clusters card below it. */
const PILL_CARD_GAP = 16;

/** The clusters card at its settled height, every cluster revealed. MEASURED.
 *  Re-measure if the cluster count changes, or if a cluster NAME does: the
 *  names wrap inside the card's 440px column, so a longer one costs a row. */
const CLUSTERS_CARD_H = 449;

/** Top of the clusters card inside the frame, and of the pill parked above it:
 *
 *    ╭─pill─╮   ← pillTop
 *      ↕ gap
 *    ┌────────┐ ← cardTop
 *    │clusters│  grows downward
 *    └────────┘
 *
 *  The CARD is what is centred, not the pill-plus-card pair. At rest the pill
 *  has dropped inside the card and is out of sight, so centring the pair left
 *  the only thing still visible sitting ~35px low.
 *
 *  Centred on the CONSTANT above, not on a live measurement. The card's list
 *  hugs its rows, so it grows through Act 2, and centring a measured height
 *  would drag it upward under the reader while they were still watching those
 *  rows arrive. Growth extends downward off this line instead. */
const CARD_TOP = Math.round((FRAME_H - CLUSTERS_CARD_H) / 2);

export const assemblyLayout = (pillH: number) => ({
  pillTop: CARD_TOP - PILL_CARD_GAP - pillH,
  cardTop: CARD_TOP,
});
