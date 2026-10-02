import type {TimelineConfig} from 'dialkit/timeline';
import {MAX_DISPERSION_FRAMES} from './dispersion';

export const MICRO_14_FPS = 30;
export const MICRO_14_TIMELINE_ID = 'micro-animation-14-timeline-v2';
export type Micro14Controls = {seed: number; dispersionFrames: number; swapProbability: number; swapGap: number; smallClusterDelay: number; timelineDuration: number; warningCoverDuration: number; warningAppearanceDuration: number};
export const MICRO_14_DEFAULTS: Readonly<Micro14Controls> = Object.freeze({seed: 209, dispersionFrames: 90, swapProbability: .62, swapGap: .25, smallClusterDelay: .6, timelineDuration: 13.1, warningCoverDuration: .8, warningAppearanceDuration: .25});
export type ClipTiming = Readonly<{at: number; duration: number}>;
export type Micro14Timing = Readonly<{appearance: ClipTiming; swapping: ClipTiming}>;
export const MICRO_14_TIMING: Micro14Timing = {appearance: {at: 0, duration: 1.01}, swapping: {at: 1.11, duration: 2.3}};
// Appearance and Swapping are scheduled globally. Covers are formation-triggered,
// with a shared duration dial, so obsolete merge tracks cannot delay them.
export const MICRO_14_TIMELINE = {...MICRO_14_TIMING} satisfies TimelineConfig;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const unit = (value: number, fallback: number) => Math.max(0, Math.min(1, finite(value, fallback)));
export const normalizeControls = (controls: Micro14Controls): Micro14Controls => ({
  seed: Math.round(finite(controls.seed, MICRO_14_DEFAULTS.seed)),
  dispersionFrames: Math.max(0, Math.min(MAX_DISPERSION_FRAMES, Math.round(finite(controls.dispersionFrames, MICRO_14_DEFAULTS.dispersionFrames)))),
  swapProbability: unit(controls.swapProbability, MICRO_14_DEFAULTS.swapProbability),
  swapGap: Math.min(.95, unit(controls.swapGap, MICRO_14_DEFAULTS.swapGap)),
  smallClusterDelay: Math.min(.95, unit(controls.smallClusterDelay, MICRO_14_DEFAULTS.smallClusterDelay)),
  timelineDuration: Math.max(1, Math.min(60, finite(controls.timelineDuration, MICRO_14_DEFAULTS.timelineDuration))),
  warningCoverDuration: Math.max(0, Math.min(5, finite(controls.warningCoverDuration, MICRO_14_DEFAULTS.warningCoverDuration))),
  warningAppearanceDuration: Math.max(0, Math.min(2, finite(controls.warningAppearanceDuration, MICRO_14_DEFAULTS.warningAppearanceDuration))),
});
export const normalizeTiming = (timing: Micro14Timing): Micro14Timing => Object.fromEntries(
  Object.entries(MICRO_14_TIMING).map(([key, fallback]) => {
    const clip = timing[key as keyof Micro14Timing] ?? fallback;
    return [key, {at: Math.max(0, finite(clip.at, fallback.at)), duration: Math.max(0, finite(clip.duration, fallback.duration))}];
  }),
) as Micro14Timing;
export const micro14DurationFrames = (duration = MICRO_14_DEFAULTS.timelineDuration) => Math.ceil(duration * MICRO_14_FPS);
export const clipProgress = (time: number, clip: ClipTiming) => clip.duration === 0
  ? (time >= clip.at ? 1 : 0)
  : Math.max(0, Math.min(1, (time - clip.at) / clip.duration));
