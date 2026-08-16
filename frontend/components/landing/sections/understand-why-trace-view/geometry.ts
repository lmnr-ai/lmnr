// Geometry of the right-hand column.
//
// The frame is a fixed window holding ONE trace panel, centred:
//
//   frame:  ┌───────────────┐
//           │  [  trace  ]  │
//           └───────────────┘
//
// It used to hold a horizontally sliding tray of two traces plus a chat
// column. That is gone — one trace means nothing to slide between — so the
// only offset left is the centring, and everything else derives from it.

export const FRAME_W = 480;
export const FRAME_H = 760;

export const PANEL_W = 400;
export const PANEL_H = 680;

/** The panel is a bordered card, so its outer width is 2px wider than its
 *  content. Counted here so the centring is exact rather than 2px off. */
const PANEL_BORDER = 2;

/** Left edge of the panel inside the frame. */
export const PANEL_X = (FRAME_W - PANEL_W - PANEL_BORDER) / 2;

/** Width of the frame's edge vignettes. Exactly the panel's resting margin, so
 *  they sit over bare frame background and only bite on the signal stack's
 *  cascade, which is wider than the frame and bleeds off both edges. */
export const EDGE_FADE_W = PANEL_X;

/** Gap between the resting pill and the clusters card below it. */
const PILL_CARD_GAP = 16;

/** Where the pill and the clusters card come to rest at the end of the last
 *  step, as a single vertically-centred assembly:
 *
 *    ╭─pill─╮   ← pillTop
 *      ↕ gap
 *    ┌────────┐ ← cardTop
 *    │clusters│
 *    └────────┘
 *
 *  Centring the PAIR rather than either half is what keeps the composition
 *  balanced whichever of the two changes height. Both are absolute offsets
 *  from the frame's top edge. */
export const assemblyLayout = (pillH: number, cardH: number) => {
  const top = (FRAME_H - (pillH + PILL_CARD_GAP + cardH)) / 2;
  return { pillTop: top, cardTop: top + pillH + PILL_CARD_GAP };
};
