import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {normalizeClip} from '../micro-20/timeline';
import {sampleMicro23Progress, clamp01} from '../micro-23/sample';
import {MICRO_23_KEYS, MICRO_23_TIMELINE, type Micro23Key} from '../micro-23/timeline';
import type {ClipTiming, Flow21Timing, Ultimate3Settings} from './settings';
import {interpolateCamera, type SharedCamera} from './transitions';

export const COMPARISON_TRACKS = Object.fromEntries(MICRO_23_KEYS.map(key => [key, `comparison_${key}`])) as Record<Micro23Key, `comparison_${Micro23Key}`>;
export const COMPARISON_KEYS = ['comparisonExit', 'comparisonHeadingExit', ...Object.values(COMPARISON_TRACKS)] as const;
export type ComparisonKey = typeof COMPARISON_KEYS[number];
export type FlowComparison = {version: 1 | 2; timing: Record<ComparisonKey, ClipTiming>};
export const REPLACED_GRAPH_KEYS = ['graphSpread', 'xAxisEntry', 'yAxisExit', 'xAxisExit', 'benchmarkHeadingExit', 'analysisHeading', 'flowLabel', 'stringExit'] as const;

/** Fit the new picture into the existing comparison slot, never move the engine.
 * Current v11 cut: exit 37.01–37.28, insert 37.30, continuous arrival 40.07–41.33.
 * The legacy camera bar/audio metadata stays unchanged; one return clip owns the
 * combined visual zoom/descent. Stored custom timings remain editable. */
export function comparisonDefaults(timing: Flow21Timing, version: 1 | 2 = 2): FlowComparison {
  const end = Math.max(.2, timing.cameraToEngine.at - .13);
  const start = Math.max(0, Math.min(timing.graphSpread.at + .06, end - .1));
  const ratio = (end - start) / (3.96 - .07);
  const clip = (at: number, duration: number): ClipTiming => ({at: Math.max(0, at), duration, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration, ease: [.45, 0, .55, 1]}});
  const tracks = Object.fromEntries(MICRO_23_KEYS.map(key => {
    const source = MICRO_23_TIMELINE[key], duration = source.duration * ratio;
    return [COMPARISON_TRACKS[key], {...source, at: start + (source.at - .07) * ratio, duration, transition: {...source.transition, duration}}];
  })) as FlowComparison['timing'];
  // Hold the completed comparison through the spoken "per dollar", then return.
  const returnDuration = Math.min(.47, (end - start) * .2);
  const returnAt = end - returnDuration;
  tracks.comparison_returnToGrid = clip(returnAt, version === 1 ? returnDuration : Math.max(0, timing.cameraToEngine.at + timing.cameraToEngine.duration - returnAt));
  tracks.comparisonExit = clip(start - .29, .27);
  tracks.comparisonHeadingExit = clip(start - .29, .23);
  return {version, timing: tracks};
}

export function normalizeComparison(input: unknown, timing: Flow21Timing): FlowComparison | false | undefined {
  if (input === false) return false;
  if (!input || typeof input !== 'object' || ![1, 2].includes((input as FlowComparison).version)) return undefined;
  const version = (input as FlowComparison).version;
  const defaults = comparisonDefaults(timing, version);
  return {version, timing: Object.fromEntries(COMPARISON_KEYS.map(key => [key, normalizeClip((input as FlowComparison).timing?.[key], defaults.timing[key])])) as FlowComparison['timing']};
}

/** Load-only migration; explicit JSON imports can opt out with comparison:false. */
export function withFlowComparison(settings: Ultimate3Settings): Ultimate3Settings {
  if (settings.flow.sourceVersion !== 21 || !settings.flow.timing21 || settings.flow.comparison === false) return settings;
  const current = settings.flow.comparison;
  if (current?.version === 2) return settings;
  const defaults = comparisonDefaults(settings.flow.timing21);
  if (!current) return {...settings, flow: {...settings.flow, comparison: defaults}};
  const key = 'comparison_returnToGrid';
  const legacy = comparisonDefaults(settings.flow.timing21, 1).timing[key];
  const wasDefault = JSON.stringify(normalizeClip(current.timing[key], legacy)) === JSON.stringify(normalizeClip(legacy, legacy));
  return {...settings, flow: {...settings.flow, comparison: {version: 2,
    timing: {...current.timing, ...(wasDefault ? {[key]: defaults.timing[key]} : {})}}}};
}

/** Register the comparison and engine in one camera space during the return.
 * Six empty dense rows keep the engine below the viewport at the start. They
 * preserve grid phase, while the comparison's registration preserves its pose.
 * Both layers then follow exactly the same transform: no second pan or stop. */
export function flowComparisonArrival(benchmark: SharedCamera, engine: SharedCamera, progress: number, gridShrink = 1) {
  const phase = (n: number) => ((n % 60) + 60) % 60;
  const offset = {x: phase(benchmark.x) - 40, y: phase(benchmark.y)};
  const cell = 60 - 40 * gridShrink, sourceScale = cell / 20, zoom = cell / (100 * benchmark.scale);
  const centerY = 360 - 10 * gridShrink;
  const start = {scale: cell / 100,
    x: (benchmark.x - 640 - offset.x) * zoom + 640 + offset.x,
    y: (benchmark.y - 360 - offset.y) * zoom + centerY + offset.y + 6 * cell};
  // Collapse floating-point endpoint noise, not any visible part of the curve.
  const p = progress < 1e-9 ? 0 : progress > 1 - 1e-9 ? 1 : progress;
  const camera = interpolateCamera(start, engine, p);
  const ratio = camera.scale / start.scale;
  const x = camera.x - start.x * ratio + ratio * (640 * (1 - sourceScale) + offset.x);
  const y = camera.y - start.y * ratio + ratio * (centerY - 350 * sourceScale + offset.y);
  return {camera, worldTransform: `matrix(${ratio * sourceScale},0,0,${ratio * sourceScale},${x},${y})`};
}

let cached: {signature: string; resolved: ReturnType<typeof computeStaticTimeline>} | undefined;
export function sampleFlowComparison(time: number, comparison: FlowComparison, current?: Record<ComparisonKey, number>) {
  const signature = JSON.stringify(comparison.timing);
  if (cached?.signature !== signature) {
    cached = {signature, resolved: computeStaticTimeline(parseTimelineConfig(Object.fromEntries(COMPARISON_KEYS.map(key => [key,
      {from: {progress: 0}, to: {progress: 1}, ...comparison.timing[key]}]))), {})};
  }
  // DialKit 1.4's static resolver supplies an easing duration for instant clips.
  // Retain the authored discrete endpoints instead, in both live and export.
  const instant = (clip: ClipTiming) => clip.duration === 0 || (clip.transition as {type?: string} | undefined)?.type === 'instant';
  const clips = cached.resolved.clips.map(clip => instant(comparison.timing[clip.key as ComparisonKey]) ? {...clip, duration: 0} : clip);
  const progress = Object.fromEntries(clips.map(clip => {
    const source = comparison.timing[clip.key as ComparisonKey];
    return [clip.key, clamp01(instant(source) ? (time >= clip.at ? source.to?.progress ?? 1 : source.from?.progress ?? 0)
      : current?.[clip.key as ComparisonKey] ?? (computeClipState(clip, time, time).current as {progress: number}).progress)];
  })) as Record<ComparisonKey, number>;
  const byKey = Object.fromEntries(clips.map(clip => [clip.key, clip]));
  const sourceProgress = Object.fromEntries(MICRO_23_KEYS.map(key => [key, progress[COMPARISON_TRACKS[key]]])) as Record<Micro23Key, number>;
  const starts = Object.fromEntries(MICRO_23_KEYS.map(key => [key, byKey[COMPARISON_TRACKS[key]].at])) as Record<Micro23Key, number>;
  const durations = Object.fromEntries(MICRO_23_KEYS.map(key => [key, byKey[COMPARISON_TRACKS[key]].duration])) as Record<Micro23Key, number>;
  return {continuous: comparison.version === 2, returnAt: starts.returnToGrid, returnEnd: starts.returnToGrid + durations.returnToGrid,
    sample: sampleMicro23Progress(time, sourceProgress, undefined, starts, durations),
    start: Math.min(...Object.values(starts)), assemblyExit: progress.comparisonExit, headingExit: progress.comparisonHeadingExit,
    gridStrokeWidth: 1 - .5 * sourceProgress.gridShrink * (1 - sourceProgress.returnToGrid)};
}
