import type {TimelineConfig} from 'dialkit/timeline';
import {SPEED} from './geometry';
import {DITHER_LOOP_SECONDS} from './dither';

export const MICRO_08_DURATION = 12;
export const MICRO_08_DISTANCE = SPEED * MICRO_08_DURATION;
export const MICRO_08_TIMELINE_ID = 'micro-animation-08-timeline-v6';
const linear = [1 / 3, 1 / 3, 2 / 3, 2 / 3] as [number, number, number, number];
const ease = [.45, 0, .55, 1] as [number, number, number, number];
const progressClip = (at: number, duration: number, curve = ease) => ({
  at, duration, from: {progress: 0}, to: {progress: 1},
  transition: {type: 'easing' as const, duration, ease: curve},
});
export const MICRO_08_TIMELINE = {
  duration: MICRO_08_DURATION,
  dither: {
    at: 0, duration: MICRO_08_DURATION,
    from: {progress: 0}, to: {progress: MICRO_08_DURATION / DITHER_LOOP_SECONDS},
    transition: {type: 'easing', duration: MICRO_08_DURATION, ease: linear},
  },
  travel: {
    at: 0, duration: MICRO_08_DURATION,
    from: {distance: 0}, to: {distance: MICRO_08_DISTANCE},
    // Independent linear travel runs THROUGH the outro, not just to landing.
    transition: {type: 'easing', duration: MICRO_08_DURATION, ease: linear},
  },
  dotPosition: progressClip(8, 2),
  dotShrink: progressClip(8, 1.8),
  loaderStroke: progressClip(8.2, 1.4),
  backdropFade: progressClip(9.6, 1.2),
  // Landing ends10s. Tails stay fully opaque/moving for another0.4s, THEN exit.
  streamerExit: progressClip(10.4, .5),
  // Start with the loaders. Column-local easing lives in gridColumnProgress;
  // keep this master clock linear so the stagger remains uniform in seconds.
  gridSlide: progressClip(8, 3.3, linear),
  dotDim: progressClip(11.05, .6),
} satisfies TimelineConfig;
