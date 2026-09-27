import type {TimelineConfig, TransitionConfig} from 'dialkit';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {sampleMicro15} from '../micro-15/sample';
import {START_CELLS} from '../micro-15/starting-positions';
import {travelTimingForCell} from '../micro-15/travel';
import {SQL_PREDICATE, SQL_PREDICATE_PREFIX} from '../micro-15/agent-window';
import {MICRO_15_DEFAULTS, MICRO_15_TIMELINE, MICRO_15_TIMING, normalizeMicro15Controls, type Micro15Controls, type Micro15Timing} from '../micro-15/timeline';

export type ClipTiming = {at: number; duration: number; from?: {progress: number}; to?: {progress: number}; transition?: TransitionConfig};
export const MICRO_20_TIMELINE_ID = 'micro-animation-20-main-timeline-v2';
export const LEGACY_MAIN_ID = 'micro-animation-20-main-timeline-v1';
export const MICRO_20_ISSUES_TIMELINE_ID = 'micro-animation-20-issues-timeline-v1';
export const MICRO_20_CONTROLS_ID = 'micro-animation-20-prelude-controls-v1';
export const MICRO_20_ISSUES_CONTROLS_ID = 'micro-animation-20-issues-controls-v1';
export const ISSUE_START = 7.5;
const ease = [.45, 0, .55, 1] as [number, number, number, number];
const clip = (at: number, duration: number): ClipTiming => ({at, duration, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration, ease}});
export const PRELUDE_TIMING = {
  blueBashEntry: clip(.4, .75),
  blueBashStop: clip(1.1, .25), bashExpand: clip(1.45, .2),
  bashDescent: clip(1.6, 1.69),
  bashHighlight: clip(2.85, .55),
  analysisZoomOut: clip(3.45, 2), analysisTraceCollapse: clip(4.65, .6), analysisLocalGridFade: clip(4.65, .6),
  analysisCircleGrow: clip(5.25, 1.9), analysisCircleFade: clip(7.05, .35),
  analysisAgentScaleOut: clip(7.05, .45),
  // Historical persisted key: final readiness/hold gate, no geometric movement.
  analysisLayout: clip(7.05, .45),
  subtitleFlow: clip(0, 3.45),
  subtitleDetection: clip(5.45, 1.8),
};
export type PreludeTiming = {[K in keyof typeof PRELUDE_TIMING]: ClipTiming};
export type IssueTiming = {[K in keyof Micro15Timing]: ClipTiming};
export const PRELUDE_KEYS = Object.keys(PRELUDE_TIMING) as (keyof PreludeTiming)[];
export const ISSUE_KEYS = (Object.keys(MICRO_15_TIMING) as (keyof IssueTiming)[]).filter(key => key !== 'appearance');
export const SPINNER_SPEED_KEYS = ['spinnerEntrySpeed', 'spinnerStopSpeed', 'spinnerDescentSpeed', 'spinnerZoomSpeed', 'spinnerAnalysisSpeed'] as const;
export const MICRO_20_DEFAULTS = {
  spinnerEntrySpeed: 1.9, spinnerStopSpeed: 1.9, spinnerDescentSpeed: 1.9,
  spinnerZoomSpeed: 1.9, spinnerAnalysisSpeed: 1.9,
  radialCircleRadius: 900, radialSoftness: .2, timelineDuration: 14.5,
};
// Legacy explicit export props still work; the editor exposes only stage speeds.
export type Micro20Controls = typeof MICRO_20_DEFAULTS & {spinnerSpeed?: number};
export const MICRO_20_ISSUE_DEFAULTS: Micro15Controls = {...MICRO_15_DEFAULTS, warningAppearanceDuration: 0};
// Authored global-second defaults, owned here rather than changing source15.
const ISSUE_GLOBAL_DEFAULTS = {
  travelStart: {at: 8.65, duration: .35}, coverAppearance: {at: 9.58, duration: .38},
  triangleScaleOut: {at: 9.22, duration: .59}, triangleScaleIn: {at: 9.59, duration: .68},
  agentWindowEnter: {at: 11.76, duration: .47}, promptTyping: {at: 11.77, duration: .44},
  issueTyping: {at: 12.14, duration: .27}, issuePadding: {at: 12.15, duration: .35},
  issueBackground: {at: 12.14, duration: .2}, issueWarningIn: {at: 12.29, duration: .3},
  messageSend: {at: 12.58, duration: .18}, cliCommandTyping: {at: 12.71, duration: .33},
  sqlQueryTyping: {at: 12.96, duration: .23}, sqlPredicateTyping: {at: 13.13, duration: .27},
  queryWarningIn: {at: 13.22, duration: .2}, agentWindowExit: {at: 14.12, duration: .38},
  subtitleIssues: {at: 7.5, duration: .94, from: {progress: 0}, to: {progress: 1}, transition: {type: 'spring', bounce: .2}},
  subtitlePatterns: {at: 8.44, duration: 2.42, from: {progress: 0}, to: {progress: 1}, transition: {type: 'spring', bounce: .2}},
  subtitleReady: {at: 10.82, duration: 3.68, from: {progress: 0}, to: {progress: 1}, transition: {type: 'spring', bounce: .2}},
} satisfies Record<(typeof ISSUE_KEYS)[number], ClipTiming>;
export const MICRO_20_ISSUE_TIMING: IssueTiming = {...MICRO_15_TIMELINE,
  ...Object.fromEntries(ISSUE_KEYS.map(key => [key, {...MICRO_15_TIMELINE[key], ...ISSUE_GLOBAL_DEFAULTS[key],
    at: Math.round((ISSUE_GLOBAL_DEFAULTS[key].at - ISSUE_START) * 1e9) / 1e9}])),
  appearance: {at: 0, duration: 0},
} as IssueTiming;
export const MICRO_20_TIMELINE = {
  duration: MICRO_20_DEFAULTS.timelineDuration,
  ...PRELUDE_TIMING,
  issues: Object.fromEntries(ISSUE_KEYS.map(key => [key, {...MICRO_20_ISSUE_TIMING[key], at: ISSUE_GLOBAL_DEFAULTS[key].at}])),
} satisfies TimelineConfig;
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
export const unit = (value: number) => Math.max(0, Math.min(1, value));
export const normalizeMicro20Controls = (value: Partial<Micro20Controls> = {}): Micro20Controls => ({
  ...Object.fromEntries(SPINNER_SPEED_KEYS.map(key => [key, Math.max(0, Math.min(10, finite(value[key], finite(value.spinnerSpeed, MICRO_20_DEFAULTS[key]))))])) as Pick<Micro20Controls, typeof SPINNER_SPEED_KEYS[number]>,
  radialCircleRadius: Math.max(0, Math.min(1400, finite(value.radialCircleRadius, MICRO_20_DEFAULTS.radialCircleRadius))),
  radialSoftness: unit(finite(value.radialSoftness, .2)),
  timelineDuration: Math.max(1, finite(value.timelineDuration, 14.5)),
});
export const normalizeIssueStart = (value: number) => Math.max(0, finite(value, ISSUE_START));
export function normalizeClip(value: Partial<ClipTiming> | undefined, fallback: ClipTiming): ClipTiming {
  return {at: Math.max(0, finite(value?.at, fallback.at)), duration: Math.max(0, finite(value?.duration, fallback.duration)),
    ...(value?.transition ?? fallback.transition ? {transition: value?.transition ?? fallback.transition} : {}),
    ...(fallback.from || value?.from ? {from: {progress: finite(value?.from?.progress, fallback.from?.progress ?? 0)}} : {}),
    ...(fallback.to || value?.to ? {to: {progress: finite(value?.to?.progress, fallback.to?.progress ?? 1)}} : {}),
  };
}
export function normalizePreludeTiming(input: Partial<PreludeTiming> = PRELUDE_TIMING): PreludeTiming {
  return Object.fromEntries(PRELUDE_KEYS.map(key => [key, normalizeClip(input[key], PRELUDE_TIMING[key])])) as PreludeTiming;
}
export function normalizeIssueTiming(input: Partial<IssueTiming> = MICRO_20_ISSUE_TIMING): IssueTiming {
  return {...Object.fromEntries(ISSUE_KEYS.map(key => [key, normalizeClip(input[key], MICRO_20_ISSUE_TIMING[key])])), appearance: {at: 0, duration: 0}} as IssueTiming;
}
export const resolvePreludeClips = (input: Partial<PreludeTiming> = PRELUDE_TIMING) => computeStaticTimeline(parseTimelineConfig(normalizePreludeTiming(input)), {}).clips;
export function clipEnd(clip: ClipTiming) {
  if (clip.duration === 0) return clip.at;
  const resolved = computeStaticTimeline(parseTimelineConfig({clip}), {}).clips[0];
  return clip.at + Math.max(clip.duration, resolved.duration);
}
/** Full authored endpoints/curves; no separate live-state evaluator or clamp policy. */
export function evaluateClip(clip: ClipTiming, time: number) {
  if (clip.duration === 0) return time >= clip.at ? clip.to?.progress ?? 1 : clip.from?.progress ?? 0;
  const resolved = computeStaticTimeline(parseTimelineConfig({clip}), {}).clips[0];
  return (computeClipState(resolved, time, time) as {current?: {progress?: number}}).current?.progress
    ?? unit((time - clip.at) / clip.duration);
}
/** Bars are earliest starts. Dependencies delay intact clips, never truncate them. */
export function resolvePreludeSchedule(input: Partial<PreludeTiming> = PRELUDE_TIMING): PreludeTiming {
  const t = normalizePreludeTiming(input);
  const after = (key: keyof PreludeTiming, dependencies: (keyof PreludeTiming)[], gap = 0) => {
    t[key] = {...t[key], at: Math.max(t[key].at, ...dependencies.map(dep => clipEnd(t[dep]) + gap))};
  };
  after('analysisZoomOut', ['blueBashEntry', 'blueBashStop', 'bashExpand', 'bashDescent', 'bashHighlight']);
  for (const key of ['analysisTraceCollapse', 'analysisLocalGridFade'] as const) {
    t[key] = {...t[key], at: Math.max(t[key].at, t.analysisZoomOut.at + t.analysisZoomOut.duration * .6)};
  }
  after('subtitleDetection', ['analysisZoomOut']);
  after('analysisCircleGrow', ['analysisZoomOut'], .2);
  after('analysisCircleGrow', ['analysisTraceCollapse', 'analysisLocalGridFade']);
  after('analysisCircleFade', ['analysisCircleGrow']);
  after('analysisAgentScaleOut', ['analysisCircleGrow']);
  after('analysisLayout', ['analysisCircleGrow', 'analysisAgentScaleOut']);
  return t;
}
export function effectiveIssueStart(timing: Partial<PreludeTiming>, earliest = ISSUE_START) {
  return Math.max(normalizeIssueStart(earliest), ...Object.values(resolvePreludeSchedule(timing)).map(clipEnd));
}
/** Mirrors source15's arrival/merge and after-send dependencies without changing it. */
export function issueEnd(rawControls = MICRO_20_ISSUE_DEFAULTS, input: Partial<IssueTiming> = MICRO_20_ISSUE_TIMING) {
  const controls = normalizeMicro15Controls(rawControls), t = normalizeIssueTiming(input);
  const source = sampleMicro15(0, {...controls, warningAppearanceDuration: 0}, t);
  const ready = Math.max(...Object.values(source.clusters).map(cluster => cluster.readyAt));
  const lastArrival = Math.max(...Object.entries(START_CELLS).map(([id, cell]) => {
    if (id === `cell-${cell}`) return 0;
    const travel = travelTimingForCell(cell, t.travelStart, controls.travelDuration);
    return travel.at + travel.duration;
  }));
  const sendEnd = clipEnd(t.messageSend);
  const predicateAt = Math.max(t.sqlPredicateTyping.at, sendEnd);
  const iconAt = predicateAt + t.sqlPredicateTyping.duration * (SQL_PREDICATE_PREFIX.length + 1) / SQL_PREDICATE.length;
  return Math.max(controls.timelineDuration, lastArrival, ...Object.values(t).map(clipEnd),
    ...(['coverAppearance', 'triangleScaleOut', 'triangleScaleIn'] as const).map(key => Math.max(ready, t[key].at) + t[key].duration),
    ...(['cliCommandTyping', 'sqlQueryTyping', 'sqlPredicateTyping'] as const).map(key => Math.max(sendEnd, t[key].at) + t[key].duration),
    Math.max(iconAt, t.queryWarningIn.at) + t.queryWarningIn.duration);
}
export type Micro20AuthoredProps = Partial<Micro20Controls> & {preludeTiming?: Partial<PreludeTiming>; issueTiming?: Partial<IssueTiming>; issueControls?: Micro15Controls; issueStart?: number};
export function micro20PostludeDurationFrames(props: Micro20AuthoredProps = {}) {
  const start = effectiveIssueStart(props.preludeTiming ?? PRELUDE_TIMING, props.issueStart);
  // Include a frame AT/AFTER the resolved endpoint, not just the frame before it.
  return Math.ceil(Math.max(normalizeMicro20Controls(props).timelineDuration, start + issueEnd(props.issueControls, props.issueTiming)) * 30 - 1e-9) + 1;
}
export const MICRO_20_OUTRO_DURATION = 2;
/** Standalone alone appends the closing field; Ultimate3 owns its existing slot. */
export const micro20DurationFrames = (props: Micro20AuthoredProps = {}) => micro20PostludeDurationFrames(props) + MICRO_20_OUTRO_DURATION * 30 + 1;
/** The same extraction seam is used in App and exercised by export parity tests. */
export function serializeTimeline(timeline: Record<string, unknown>, flat: Record<string, unknown> = {}) {
  const extract = (key: string, value: unknown, fallback: ClipTiming) => {
    const state = (value ?? fallback) as ClipTiming;
    return normalizeClip({...state,
      at: finite(flat[`${key}.at`] as number, state.at),
      duration: finite(flat[`${key}.duration`] as number, state.duration),
    }, fallback);
  };
  const preludeTiming = normalizePreludeTiming(Object.fromEntries(PRELUDE_KEYS.map(key => [key, extract(key, timeline[key], PRELUDE_TIMING[key])])));
  const issues = (timeline.issues ?? {}) as Partial<IssueTiming>;
  const issueTiming = normalizeIssueTiming(Object.fromEntries(ISSUE_KEYS.map(key => {
    const fallback = {...MICRO_20_ISSUE_TIMING[key], at: ISSUE_GLOBAL_DEFAULTS[key].at};
    const value = extract(`issues.${key}`, issues[key], fallback);
    return [key, {...value, at: value.at - ISSUE_START}];
  })));
  return {preludeTiming, issueTiming};
}
