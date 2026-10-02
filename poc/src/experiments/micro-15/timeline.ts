import type {TimelineConfig} from 'dialkit/timeline';
import type {ClipTiming} from '../micro-14/timeline';
import {AGENT_TIMING, type AgentTiming} from './agent-window';

export type Micro15Controls = {
  warningAppearanceDuration: number;
  travelDuration: number;
  timelineDuration: number;
};
export const MICRO_15_SUBTITLE_KEYS = ['subtitleIssues', 'subtitlePatterns', 'subtitleReady'] as const;
export type Micro15SubtitleKey = typeof MICRO_15_SUBTITLE_KEYS[number];
export type Micro15Timing = Readonly<{
  appearance: ClipTiming;
  travelStart: ClipTiming;
  coverAppearance: ClipTiming;
  triangleScaleOut: ClipTiming;
  triangleScaleIn: ClipTiming;
  subtitleIssues: ClipTiming;
  subtitlePatterns: ClipTiming;
  subtitleReady: ClipTiming;
}> & AgentTiming;
export const MICRO_15_DEFAULTS: Readonly<Micro15Controls> = Object.freeze({
  warningAppearanceDuration: .25, travelDuration: 2.3, timelineDuration: 7,
});
export const MICRO_15_TIMELINE_ID = 'micro-animation-15-timeline-v3';
export const MICRO_15_TIMING: Micro15Timing = {
  appearance: {at: 0, duration: 1.19}, travelStart: {at: 1.15, duration: .35},
  coverAppearance: {at: 2.08, duration: .38},
  triangleScaleOut: {at: 1.72, duration: .59},
  triangleScaleIn: {at: 2.09, duration: .68},
  ...AGENT_TIMING,
  subtitleIssues: {at: 0, duration: .94},
  subtitlePatterns: {at: .94, duration: 2.42},
  subtitleReady: {at: 3.32, duration: 3.68},
};
const progressClip = (clip: ClipTiming) => ({...clip, transition: {type: 'spring' as const, bounce: .2}, from: {progress: 0}, to: {progress: 1}});
export const MICRO_15_TIMELINE = {
  ...MICRO_15_TIMING,
  ...Object.fromEntries(MICRO_15_SUBTITLE_KEYS.map(key => [key, progressClip(MICRO_15_TIMING[key])])),
} satisfies TimelineConfig;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
export const normalizeMicro15Controls = (controls: Micro15Controls): Micro15Controls => ({
  warningAppearanceDuration: Math.max(0, Math.min(2, finite(controls.warningAppearanceDuration, MICRO_15_DEFAULTS.warningAppearanceDuration))),
  travelDuration: Math.max(0, Math.min(10, finite(controls.travelDuration, MICRO_15_DEFAULTS.travelDuration))),
  timelineDuration: Math.max(1, Math.min(60, finite(controls.timelineDuration, MICRO_15_DEFAULTS.timelineDuration))),
});
export const normalizeMicro15Timing = (timing: Micro15Timing): Micro15Timing => Object.fromEntries(
  Object.entries(MICRO_15_TIMING).map(([key, fallback]) => {
    const clip = timing[key as keyof Micro15Timing] ?? fallback;
    return [key, {at: Math.max(0, finite(clip.at, fallback.at)), duration: Math.max(0, finite(clip.duration, fallback.duration))}];
  }),
) as Micro15Timing;
export const micro15DurationFrames = (duration = MICRO_15_DEFAULTS.timelineDuration, timing: Micro15Timing = MICRO_15_TIMING) => Math.ceil(Math.max(
  duration,
  ...MICRO_15_SUBTITLE_KEYS.map(key => timing[key].at + timing[key].duration),
) * 30);
