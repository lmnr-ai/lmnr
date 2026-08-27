// Geometry of the right-hand column: a window of fixed HEIGHT holding one
// centred trace panel. Its WIDTH is a media query, so nothing here may derive
// from one — horizontal placement is CSS centring, and the one consumer that
// needs a number measures the frame itself (see ./signal-stack).

export const FRAME_H = 760;

export const PANEL_H = 680;

/** The panel's width, on the SAME breakpoint the frame uses — it gets the extra
 *  room the wider frame buys rather than leaving it all to the margins. */
export const PANEL_W_CLS = "w-[400px] 2xl:w-[420px]";

/** The frame's edge vignettes: exactly the panel's resting margin, so they sit
 *  over bare background and only bite on the signal stack's wider cascade. The
 *  402/422 are the widths above plus the panel's own 2px border. */
export const EDGE_FADE_W_CLS = "w-[calc((100%-402px)/2)] 2xl:w-[calc((100%-422px)/2)]";

/** Gap between the resting pill and the clusters card below it. */
const PILL_CARD_GAP = 16;

/** The clusters card at its settled height. Only a SEED for the frames before
 *  ./clusters-stage has measured the live one. */
export const CLUSTERS_CARD_H_SEED = 404;

/** Top of the clusters card, with the pill parked a gap above it. Centred on
 *  the card's LIVE height, so it stays centred as its list grows through Act 2
 *  rather than only at the end, and the pill's rest follows it. */
export const assemblyLayout = (pillH: number, cardH: number) => {
  const cardTop = Math.round((FRAME_H - cardH) / 2);
  return { pillTop: cardTop - PILL_CARD_GAP - pillH, cardTop };
};
