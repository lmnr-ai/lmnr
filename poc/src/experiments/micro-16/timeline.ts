import type {TimelineConfig, TransitionConfig} from 'dialkit';
import {computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';

export const MICRO_16_DURATION = 17;
export const MICRO_16_FINAL_HOLD = 0;
export const MICRO_16_TIMELINE_ID = 'micro-animation-16-timeline-v1';
const smooth = [.45, 0, .55, 1] as [number, number, number, number];
const linear = [0, 0, 1, 1] as [number, number, number, number];
const clip = (at: number, duration: number, ease = smooth) => ({at, duration,
  from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing' as const, duration, ease}});

export const MICRO_16_TIMELINE = {
  duration: MICRO_16_DURATION,
  // One uninterrupted sweep, using Flow-1's cloud renderer and texture.
  cloudSweep: clip(.45, 3.26),
  cheapLegOneRight: clip(1.4, .4, linear),
  cheapLegTwoLeft: clip(1.89, .4, linear),
  cheapLegThreeRight: clip(2.39, .4, linear),
  // One shared progress drives the door, warning rise, and warning rotation.
  thinkingDrop: clip(2.95, .55),
  cameraDownToBash: clip(4.51, 1.58),
  purpleBashEntry: clip(5.38, .75, linear),
  purpleBashStop: clip(6.08, .25),
  bashExpand: clip(6.23, .2),
  bashDescent: clip(6.4, 1.84),
  bashHighlight: clip(7.9, .7, linear),
  bashWarning: clip(8.23, .24),
  cameraDownToBudget: clip(9, 1.3),
  purpleBudgetEntry: clip(9.56, .8),
  budgetAppear: clip(9.88, .3),
  // These clocks own a smooth physical envelope, not editable position easing.
  budgetRun: clip(10.11, .6, linear),
  smokeEnter: clip(9.85, .4),
  budgetDepletion: clip(11.07, 2.6, linear),
  smokeFade: clip(11.08, 2.6),
  smokeShrink: clip(11.07, 2.6),
  // Four independent subtitle bars partition the narrative beats.
  subtitleCheap: clip(.45, 2.5, linear),
  subtitleMissIssues: clip(2.95, 1.73, linear),
  subtitlePowerful: clip(5.23, 4.79, linear),
  subtitleCost: clip(10.02, 6.98, linear),
} satisfies TimelineConfig;
export type ClipKey = Exclude<keyof typeof MICRO_16_TIMELINE, 'duration'>;
export const CLIP_KEYS = Object.keys(MICRO_16_TIMELINE).filter(k => k !== 'duration') as ClipKey[];
export type ClipTiming = {at: number; duration: number; transition?: TransitionConfig};
export type Timing = Record<ClipKey, ClipTiming>;
const {duration: _duration, ...authoredTiming} = MICRO_16_TIMELINE;
export const DEFAULT_TIMING: Timing = authoredTiming;
export const DEFAULTS = {travelSpeed: 660, purpleSpinnerSpeed: 1.9, cheapSpinnerSpeed: 9, cheapSpinnerStrokeWidth: 1.5, smokeSize: 1, smokeMinimumScale: .25};
export type Controls = typeof DEFAULTS;
export const normalizeControls = (input: Partial<Controls> = {}): Controls => Object.fromEntries(
  Object.entries(DEFAULTS).map(([key, fallback]) => [key, Number.isFinite(input[key as keyof Controls])
    ? Math.max(0, Math.min(key === 'travelSpeed' ? 1800 : key === 'smokeSize' ? 2 : key === 'smokeMinimumScale' ? 1 : key === 'cheapSpinnerStrokeWidth' ? 12 : 20, input[key as keyof Controls]!)) : fallback]),
) as Controls;
export function normalizeTiming(input: Partial<Timing> = {}): Timing {
  return Object.fromEntries(CLIP_KEYS.map(key => {
    const value = input[key]; const fallback = DEFAULT_TIMING[key];
    return [key, {at: Number.isFinite(value?.at) ? Math.max(0, value!.at) : fallback.at,
      duration: Number.isFinite(value?.duration) ? Math.max(0, value!.duration) : fallback.duration,
      transition: value?.transition ?? fallback.transition}];
  })) as Timing;
}

export function resolveMicro16Clips(timing: Timing) {
  const config = Object.fromEntries(CLIP_KEYS.map(key => [key, {...MICRO_16_TIMELINE[key], ...timing[key]}]));
  return computeStaticTimeline(parseTimelineConfig(config), {}).clips;
}

export function micro16DurationFrames(input: Partial<Timing> = {}) {
  const timing = normalizeTiming(input);
  // Include both authored physical envelopes and resolved visual transitions
  // (including spring settle time), with no trailing hold. Authored zero-duration clips are steps.
  const end = resolveMicro16Clips(timing).reduce((latest, clip) => {
    const authored = timing[clip.key as ClipKey];
    const duration = authored.duration === 0 ? 0 : Math.max(authored.duration, clip.duration);
    return Math.max(latest, authored.at + duration);
  }, 0);
  return Math.ceil(Math.max(MICRO_16_DURATION, end + MICRO_16_FINAL_HOLD) * 30);
}
