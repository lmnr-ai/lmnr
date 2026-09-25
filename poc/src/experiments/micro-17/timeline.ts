import type {TimelineConfig, TransitionConfig} from 'dialkit';
import {computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {STREAM_RUN_TRIM_SECONDS} from './stream-trim';

export const MICRO_17_DURATION = 22 - STREAM_RUN_TRIM_SECONDS;
export const MICRO_17_TIMELINE_ID = 'micro-animation-17-timeline-v2';
const smooth = [.45, 0, .55, 1] as [number, number, number, number];
const linear = [0, 0, 1, 1] as [number, number, number, number];
const clip = (at: number, duration: number, ease = smooth) => ({at, duration,
  from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing' as const, duration, ease}});
const shifted = (at: number) => at - STREAM_RUN_TRIM_SECONDS;

// Provisional, independent authoring bars. No football or finale tracks exist.
export const MICRO_17_TIMELINE = {
  duration: MICRO_17_DURATION,
  agentEnter: clip(0, .31, [.22, 1, .36, 1]),
  firstThinking: clip(.23, .7),
  streamRun: clip(1.9, 6.9 - STREAM_RUN_TRIM_SECONDS, linear),
  cameraCenterAgent: clip(1.9, .32),
  smokeEnter: clip(1.9, .26),
  continueStraight: clip(shifted(8.8), .65, linear),
  upwardTurn: clip(shifted(9.45), 1.1, linear),
  cameraBacktrack: clip(shifted(10.6), 1.6),
  redThinkingLift: clip(shifted(11.1), .3),
  readLift: clip(shifted(11.6), .3),
  thinkingLift: clip(shifted(12.1), .3),
  highlight: clip(shifted(12.8), 1.1, linear),
  warningEnter: clip(shifted(13.05), .24, [.22, 1, .36, 1]),
  warningFocus: clip(shifted(13.75), .55),
  finalZoom: clip(shifted(14.3), 2),
  streamCollapse: clip(shifted(15.5), .6),
  loaderFade: clip(shifted(15.5), .6),
  dotDim: clip(shifted(15.5), .6),
  smallGridFade: clip(shifted(15.5), .6),
  cloudEnter: clip(shifted(16.8), 1.4),
  cloudHold: clip(shifted(18.2), 3.8, linear),
  // Screen-pinned narrative bars; each remains independently editable.
  subtitleBuild: clip(.45, 1.45, linear),
  subtitleTrace: clip(1.9, 6.9 - STREAM_RUN_TRIM_SECONDS, linear),
  subtitleFailure: clip(shifted(8.8), 1.8, linear),
  subtitleWhy: clip(shifted(10.6), 3.15, linear),
  subtitleInsights: clip(shifted(13.75), 4.45, linear),
  subtitleIfOnly: clip(shifted(18.2), 3.8, linear),
} satisfies TimelineConfig;
export type ClipKey = Exclude<keyof typeof MICRO_17_TIMELINE, 'duration'>;
export const CLIP_KEYS = Object.keys(MICRO_17_TIMELINE).filter(key => key !== 'duration') as ClipKey[];
export type ClipTiming = {at: number; duration: number; transition?: TransitionConfig};
export type Timing = Record<ClipKey, ClipTiming>;
const {duration: _duration, ...authoredTiming} = MICRO_17_TIMELINE;
export const DEFAULT_TIMING: Timing = authoredTiming;
export function normalizeTiming(input: Partial<Timing> = {}): Timing {
  return Object.fromEntries(CLIP_KEYS.map(key => {
    const value = input[key]; const fallback = DEFAULT_TIMING[key];
    return [key, {at: Number.isFinite(value?.at) ? Math.max(0, value!.at) : fallback.at,
      duration: Number.isFinite(value?.duration) ? Math.max(0, value!.duration) : fallback.duration,
      transition: value?.transition ?? fallback.transition}];
  })) as Timing;
}
export function resolveClips(timing: Timing) {
  return computeStaticTimeline(parseTimelineConfig(Object.fromEntries(CLIP_KEYS.map(key =>
    [key, {...MICRO_17_TIMELINE[key], ...timing[key]}]))), {}).clips;
}
export function timelineEnd(timing: Timing) {
  return resolveClips(timing).reduce((end, clip) => Math.max(end, timing[clip.key as ClipKey].at +
    (timing[clip.key as ClipKey].duration === 0 ? 0 : clip.duration)), 0);
}
export const micro17DurationFrames = (input: Partial<Timing> = {}) =>
  Math.ceil(Math.max(MICRO_17_DURATION, timelineEnd(normalizeTiming(input))) * 30);

export function timingWarnings(timing: Timing) {
  const before = (a: ClipKey, b: ClipKey) => timing[b].at + .001 < timing[a].at + timing[a].duration;
  const order: [ClipKey, ClipKey][] = [['firstThinking', 'streamRun'], ['streamRun', 'continueStraight'],
    ['continueStraight', 'upwardTurn'], ['upwardTurn', 'cameraBacktrack'], ['thinkingLift', 'warningEnter'],
    ['warningFocus', 'finalZoom'], ['finalZoom', 'cloudEnter'], ['cloudEnter', 'cloudHold']];
  return [...order.filter(([a, b]) => before(a, b)).map(([a, b]) => `Keep ${b} after ${a}.`),
    ...(Math.abs(timing.cameraCenterAgent.at - timing.streamRun.at) > .001 ? ['Align cameraCenterAgent with streamRun.'] : [])];
}
