import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_05_DURATION = 10;
export const MICRO_05_TIMELINE_ID = 'micro-animation-05-timeline-v2';

const LINEAR = [0, 0, 1, 1] as [number, number, number, number];
const clip = (at: number, duration: number) => ({
  at,
  duration,
  from: {progress: 0},
  to: {progress: 1},
  transition: {type: 'easing' as const, duration, ease: LINEAR},
});

export const MICRO_05_TIMELINE = {
  duration: MICRO_05_DURATION,
  wave: clip(0, 6),
  cluster1: clip(1.5, 2.5),
  cluster2: clip(4, 2.5),
  cluster3: clip(6.5, 2.5),
} satisfies TimelineConfig;
