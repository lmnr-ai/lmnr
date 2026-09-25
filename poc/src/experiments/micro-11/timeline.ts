import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_11_DURATION = 8;
export const MICRO_11_TIMELINE_ID = 'micro-animation-11-timeline-v5';
const ease = [0.45, 0, 0.55, 1] as [number, number, number, number];

export const MICRO_11_TIMELINE = {
  duration: MICRO_11_DURATION,
  smallGridFade: {at: 2.63, duration: .48, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: .48, ease}},
  zoomOut: {at: .56, duration: 1.28, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: 1.28, ease}},
  streamCollapse: {at: 2.61, duration: .51, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: .51, ease}},
  loaderFade: {at: 2.6, duration: .55, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: .55, ease}},
  dotDim: {at: 2.62, duration: .54, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: .54, ease}},
} satisfies TimelineConfig;
