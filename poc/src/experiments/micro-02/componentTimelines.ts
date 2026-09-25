import type {TimelineConfig} from 'dialkit/timeline';

const linear = (duration: number) => ({
  type: 'easing' as const,
  duration,
  ease: [0, 0, 1, 1] as [number, number, number, number],
});

const reveal = (at: number, duration: number, from = 0) => ({
  at,
  duration,
  from: {progress: from},
  to: {progress: 1},
  transition: linear(duration),
});

/** Component timelines use percentage-like units: 0 through 100. */
export const MAIN_IMAGE_TIMELINE = {
  duration: 100,
  // Begin with the eye 1% open so frame zero contains visible image detail.
  mask: reveal(0, 100, 0.01),
  orangeBars: reveal(8, 78),
  whiteBars: reveal(16, 84),
} satisfies TimelineConfig;

export const PORTRAIT_TIMELINE = {
  duration: 100,
  container: reveal(0, 18),
  flashFrame: {at: 25, duration: 1},
  finalImage: reveal(62, 20),
} satisfies TimelineConfig;

export const STATS_TIMELINE = {
  duration: 100,
  background: reveal(0, 100),
  content: reveal(15, 35),
  count: reveal(15, 85),
} satisfies TimelineConfig;

export const RAILS_TIMELINE = {
  duration: 100,
  topRail: reveal(0, 100),
  bottomRail: reveal(0, 100),
} satisfies TimelineConfig;

export const GRIDS_TIMELINE = {
  duration: 100,
  topLeft: reveal(0, 100),
  bottomRight: reveal(0, 100),
} satisfies TimelineConfig;

export const DOTS_TIMELINE = {
  duration: 100,
  reveal: reveal(0, 100),
} satisfies TimelineConfig;

export const PARAGRAPH_TIMELINE = {
  duration: 100,
  words: reveal(0, 100),
} satisfies TimelineConfig;
