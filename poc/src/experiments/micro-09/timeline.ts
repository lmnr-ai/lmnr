import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_09_DURATION = 6;
export const MICRO_09_TIMELINE_ID = 'micro-animation-09-timeline-v3';
export const MICRO_09_TIMELINE = {
  duration: MICRO_09_DURATION,
  clouds: {
    at: 0, duration: MICRO_09_DURATION,
    from: {progress: 0}, to: {progress: 1},
    transition: {type: 'easing', duration: MICRO_09_DURATION, ease: [.45, 0, .55, 1]},
  },
} satisfies TimelineConfig;
