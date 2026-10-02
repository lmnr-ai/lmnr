import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_03_DURATION = 6;
export const MICRO_03_TIMELINE_ID = 'micro-animation-03-timeline-v4';

const clip = (
  at: number,
  duration: number,
  ease: [number, number, number, number] = [0.45, 0, 0.2, 1],
) => ({
  at,
  duration,
  from: {progress: 0},
  to: {progress: 1},
  transition: {
    type: 'easing' as const,
    duration,
    ease,
  },
});

export const MICRO_03_TIMELINE = {
  duration: MICRO_03_DURATION,
  atmosphere: clip(0, 3.95),
  flow: clip(0.73, 1.93),
  flight: clip(0.46, 2.17),
  atmosphereOutro: clip(4.06, 1.94),
  flowOutro: clip(3.43, 0.96),
  streamsOutro: clip(3.31, 2),
  planeOutro: clip(3.21, 0.88, [0.7, 0, 0.2, 0.83]),
} satisfies TimelineConfig;

export interface Micro03Values {
  atmosphere: number;
  flow: number;
  flight: number;
  atmosphereOutro: number;
  flowOutro: number;
  streamsOutro: number;
  planeOutro: number;
}
