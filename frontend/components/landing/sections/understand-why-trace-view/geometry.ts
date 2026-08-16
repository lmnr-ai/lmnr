// Geometry of the right-hand column.
//
// The frame is a fixed window. Inside it sits a "tray" — a flex row holding
// the two trace views side by side — which slides horizontally to bring the
// current step's slide into the window:
//
//   frame:        ┌───────────────┐
//   tray:   … ────│──[ trace 1 ]──│──── gap ──── [ trace 2 | chat ] ── …
//                 └───────────────┘
//
// Every offset below is DERIVED from the widths — nothing here is eyeballed,
// so changing a width keeps the three parking positions correct.

export const FRAME_W = 480;
export const FRAME_H = 760;
/** Frame's horizontal padding — the gutter the chat slide is anchored against. */
export const FRAME_PAD = 20;

export const PANEL_W = 400;
export const PANEL_H = 680;
export const CHAT_W = 360;
/** Each slide is a bordered card, so its outer width is 2px wider than its
 *  content. Counted here so the centring below is exact rather than 2px off. */
const SLIDE_BORDER = 2;

/** Empty space between the two slides, so neither peeks in mid-slide. */
export const TRAY_GAP = 64;

/** Trace 2's left edge measured from the tray's own left edge. */
const TRACE2_IN_TRAY = PANEL_W + SLIDE_BORDER + TRAY_GAP;

/** Centres a trace-only slide in the frame. */
const CENTERED = (FRAME_W - PANEL_W - SLIDE_BORDER) / 2;

/** Width of the frame's edge vignettes. Exactly the resting margin, so they
 *  sit over bare frame background when a slide is parked (invisible) and only
 *  soften the cut while the tray is moving. */
export const EDGE_FADE_W = CENTERED;

/** x of the tray's left edge relative to the frame's, per step view. */
export const TRAY_X: Record<"trace1" | "trace2" | "trace2Chat", number> = {
  trace1: CENTERED,
  trace2: CENTERED - TRACE2_IN_TRAY,
  // trace 2 + chat is wider than the frame, so it can't be centred: pin its
  // right edge to the gutter and let the transcript bleed off the left edge
  // (where the frame's left gradient picks it up).
  trace2Chat: FRAME_W - FRAME_PAD - (PANEL_W + CHAT_W + SLIDE_BORDER) - TRACE2_IN_TRAY,
};
