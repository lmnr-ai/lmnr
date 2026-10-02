import type {TimelineConfig} from 'dialkit/timeline';
import {MICRO_09_DURATION} from '../micro-09/timeline';

export const MICRO_12_DURATION = 20.9;
export const MICRO_12_TIMELINE_ID = 'micro-animation-12-timeline-v15';
const smooth = [.45, 0, .55, 1] as [number, number, number, number];
const linear = [0, 0, 1, 1] as [number, number, number, number];
const clip = (at: number, duration: number, ease = smooth) => ({at, duration, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing' as const, duration, ease}});

// REVIEW(timing): authoring defaults, not a locked edit. Preserve this order:
// streamRun finishes before backtrack; cloudEnter finishes before finale.
export const MICRO_12_TIMELINE = {
  duration: MICRO_12_DURATION,
  agentEnter: clip(0, .31, [.22, 1, .36, 1]),
  firstThinking: clip(.23, .7),
  streamRun: clip(1.9, 6.9, linear),
  // REVIEW(timing): starts with streamRun by design; retime both together if
  // the stream start moves, otherwise the camera will recenter too early/late.
  cameraCenterAgent: clip(1.9, .32),
  smokeEnter: clip(1.9, .26),
  // Stream uninterrupted for 3.9s before this pullback, then keep it live
  // through the return. Everything after football shifts as one edit block.
  footballOut: clip(5.8, 1.2),
  footballBack: clip(7, 1.2),
  cameraBacktrack: clip(8.8, 1.6),
  redThinkingLift: clip(9.3, .3),
  readLift: clip(9.8, .3),
  thinkingLift: clip(10.3, .3),
  highlight: clip(11, 1.1, linear),
  warningEnter: clip(11.25, .24, [.22, 1, .36, 1]),
  warningFocus: clip(11.95, .55),
  finalZoom: clip(12.5, 2),
  streamCollapse: clip(13.7, .6),
  loaderFade: clip(13.7, .6),
  dotDim: clip(13.7, .6),
  smallGridFade: clip(13.7, .6),
  cloudEnter: clip(15, 1.4),
  // Hold the fully entered clouds before Animation 9 begins moving them out.
  cloudHold: clip(16.4, 2, linear),
  finale: clip(18.4, 2.5, linear),
  subtitleBuild: clip(.8, 1.1, linear),
  subtitleWantKnow: clip(1.9, 1.3, linear),
  subtitleCollectRun: clip(3.2, 1.3, linear),
  subtitleTraceDoing: clip(4.5, 1.3, linear),
  subtitleCollectEvery: clip(5.8, 2.4, linear),
  subtitleBetter: clip(8.8, 6.2, linear),
  subtitleHidden: clip(15, 1.4, linear),
  subtitleIfOnly: clip(16.4, 2, linear),
  subtitleSignals: clip(18.4, 2.5, linear),
} satisfies TimelineConfig;
export type ClipKey = Exclude<keyof typeof MICRO_12_TIMELINE, 'duration'>;
export const CLIP_KEYS = Object.keys(MICRO_12_TIMELINE).filter(key => key !== 'duration') as ClipKey[];
