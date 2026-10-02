import type {TimelineConfig} from 'dialkit/timeline';
import {MICRO_10_PUFF_TIMING} from './geometry';

export const MICRO_10_DURATION = 12;
export const MICRO_10_TIMELINE_ID = 'micro-animation-10-timeline-v3';

export const MICRO_10_TIMELINE = {
  duration: MICRO_10_DURATION,
  tick: {at: .1, duration: .35, loop: true},
  puffs: {...MICRO_10_PUFF_TIMING, loop: true},
  clock: {
    at: 0,
    duration: MICRO_10_DURATION,
    from: {progress: 0},
    to: {progress: 1},
    transition: {type: 'easing', duration: MICRO_10_DURATION, ease: [1 / 3, 1 / 3, 2 / 3, 2 / 3]},
  },
} satisfies TimelineConfig;
