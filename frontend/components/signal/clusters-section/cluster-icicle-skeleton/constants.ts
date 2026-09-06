/**
 * The shimmer travelling across the placeholder strip. A wave rather than a
 * per-band pulse: the crest is keyed off each band's position across the whole
 * strip, so the rows read as one thing loading rather than N things animating.
 */
export const SHIMMER = {
  /** Wavelength, as a fraction of the strip's width. Under 1, so a crest and a
   *  trough are on the strip at once and the sweep is legible. */
  length: 0.55,
  /** Opacity at the trough and at the crest. The floor is well above 0 — bands
   *  that fade to nothing read as flickering rather than as loading. */
  min: 0.36,
  max: 1,
  /** Cycles per second the crest travels. */
  speed: 0.35,
  /** The wave is a slow gradient, so it costs nothing to draw it at less than
   *  the display's refresh rate. */
  fps: 30,
} as const;
