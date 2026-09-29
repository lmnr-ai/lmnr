import {type IssueTiming, type ClipTiming, MICRO_20_ISSUE_TIMING, ISSUE_KEYS, issueEnd, clipEnd, normalizeClip} from '../micro-20/timeline';
import type {Micro15Controls} from '../micro-15/timeline';
const clip = (at: number, duration: number, to = 1): ClipTiming => ({at, duration, from: {progress: 0}, to: {progress: to}, transition: {type: 'easing', duration, ease: [.45, 0, .55, 1]}});
export const MICRO_22_TIMELINE_ID = 'micro-animation-22-timeline-v1';
export const MICRO_22_CONTROLS_ID = 'micro-animation-22-controls-v1';
export const MICRO_22_TIMING = {
  blueBashEntry: clip(.4, .75), blueBashStop: clip(1.1, .25), bashExpand: clip(1.45, .2),
  bashDescent: clip(1.6, 1.69), bashHighlight: clip(3.2, .5), reportFocus: clip(2.9, .7),
  bubble: clip(3.8, .35), warningExit: clip(5.2, .25), labels: clip(5.5, .65), labelReveal: clip(5.85, .8),
  explanation: clip(7.5, .7), explanationTyping: clip(8.15, 2.4), bubbleExit: clip(11.3, .55),
  analysisZoomOut: clip(11.3, 1.9), analysisTraceCollapse: clip(12.3, .5), analysisLocalGridFade: clip(12.3, .5),
  analysisCircleGrow: clip(12.7, .7), analysisCircleFade: clip(13.4, .2), analysisAgentScaleOut: clip(13.2, .4), analysisLayout: clip(13.6, .1),
  subtitleFlow: clip(0, 1.6), subtitleDetection: clip(1.6, 2.2), subtitleReporting: clip(3.8, 2.05), subtitleLabels: clip(5.85, 2.3), subtitleStructure: clip(8.15, 3.15), subtitleEveryTrace: clip(11.3, 2.4),
};
export type Micro22Timing = typeof MICRO_22_TIMING;
export type Micro22Key = keyof Micro22Timing;
export const MICRO_22_KEYS = Object.keys(MICRO_22_TIMING) as Micro22Key[];
export const MICRO_22_DEFAULTS = {spinnerSpeed: 1.9};
export type Micro22Controls = typeof MICRO_22_DEFAULTS;
export type Micro22Props = {timing?: Partial<Micro22Timing>; controls?: Partial<Micro22Controls>; issueTiming?: Partial<IssueTiming>; issueControls?: Micro15Controls};
export function normalizeMicro22Timing(input: Partial<Micro22Timing> = {}): Micro22Timing {
  return Object.fromEntries(MICRO_22_KEYS.map(key => {const c = normalizeClip(input[key], MICRO_22_TIMING[key]); return [key, {...c, duration: Math.max(.05, c.duration)}];})) as Micro22Timing;
}
export const normalizeMicro22Controls = (input: Partial<Micro22Controls> = {}): Micro22Controls => ({spinnerSpeed: Number.isFinite(input.spinnerSpeed) ? Math.max(0, Math.min(10, input.spinnerSpeed!)) : 1.9});
export const micro22PreludeEnd = (timing?: Partial<Micro22Timing>) => Math.max(13.7, ...Object.values(normalizeMicro22Timing(timing)).map(clipEnd));
/** Source15's smoothstep motion and linear typing, now explicit DialKit clips. */
export const normalizeMicro22IssueTiming = (input: Partial<IssueTiming> = {}): IssueTiming => ({appearance: {at: 0, duration: 0},
  ...Object.fromEntries(ISSUE_KEYS.map(key => {
    const original = MICRO_20_ISSUE_TIMING[key];
    const c = normalizeClip(input[key], {...original, from: {progress: 0}, to: {progress: 1}});
    const duration = Math.max(.05, c.duration);
    return [key, {...c, duration, transition: c.transition ?? {type: 'easing', duration,
      ease: key.endsWith('Typing') ? [0, 0, 1, 1] : [1 / 3, 0, 2 / 3, 1]}}];
  })),
} as IssueTiming);
export const micro22Endpoint = (timing?: Partial<Micro22Timing>, issueTiming?: Partial<IssueTiming>, issueControls?: Micro15Controls) => micro22PreludeEnd(timing) + issueEnd(issueControls, normalizeMicro22IssueTiming(issueTiming), true);
export const micro22DurationFrames = (props: Micro22Props = {}) => Math.ceil((micro22Endpoint(props.timing, props.issueTiming, props.issueControls) + 2) * 30) + 1;
