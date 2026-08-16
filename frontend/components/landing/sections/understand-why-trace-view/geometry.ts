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

/** Top of the pill-plus-card assembly, from the frame's top edge:
 *
 *    ╭─pill─╮   ← ASSEMBLY_TOP
 *      ↕ gap
 *    ┌────────┐ ← cardTop
 *    │clusters│  grows downward
 *    └────────┘
 *
 *  TOP-anchored on a constant, NOT centred on a measured height. The clusters
 *  card's list hugs its rows, so it grows through Act 2 — centring would drag
 *  the pill and the card upward under the reader while they were still reading
 *  the rows arrive. Growth extends downward off this line instead.
 *
 *  The value centres the SETTLED composition — measured at 507px (34 pill + 16
 *  gap + 457 of cards, every cluster revealed) — so it has to be re-derived if
 *  the cluster count or the chart's height change. */
const ASSEMBLY_TOP = Math.round((FRAME_H - 507) / 2);

export const assemblyLayout = (pillH: number) => ({
  pillTop: ASSEMBLY_TOP,
  cardTop: ASSEMBLY_TOP + pillH + PILL_CARD_GAP,
});
