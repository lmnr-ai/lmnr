import {MICRO_22_KEYS, normalizeMicro22Timing} from '../micro-22/timeline';
import {micro22AuthoredClip} from '../micro-22/authoring';
import type {FlowPlayback} from '../introducing-flow-1/sample';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE, type FlowClipKey} from '../introducing-flow-1/timeline';
import {FLOW_2_CLIP_KEYS, FLOW_2_TIMELINE} from '../introducing-flow-1-2/timeline';
import {originalFlowPlayback, type Flow2Playback} from '../introducing-flow-1-2/sample';
import {chapterSchedule, sampleFlow, sampleIssues} from './sample';
import {flowEndpoint, issueEntryEnd, issuePostludeOffset, normalizeSettings, FLOW_21_TIMING} from './settings';
import {CLIP_KEYS as KEYS17, MICRO_17_TIMELINE} from '../micro-17/timeline';
import {CLIP_KEYS as KEYS16, MICRO_16_TIMELINE} from '../micro-16/timeline';
import type {ClipTiming, Ultimate3Settings} from './settings';
import {ISSUE_KEYS, PRELUDE_KEYS, normalizeClip} from '../micro-20/timeline';
import {CLOUD_KEYS} from './clouds';
import {VOICEOVER_PHRASES} from './voiceover-phrases';
import {COMPARISON_KEYS, REPLACED_GRAPH_KEYS, sampleFlowComparison, type ComparisonKey, type FlowComparison} from './flow-comparison';

/** Retiming must retain each source clip's from/to values for DialKit clip.current. */
export function mergeTimelineTiming(
  source: Record<string, unknown>,
  timing: Record<string, ClipTiming>,
  keys: readonly string[],
  offset = 0,
) {
  return Object.fromEntries(keys.map(key => [key, {
    ...(source[key] as object),
    ...timing[key],
    at: timing[key].at + offset,
  }]));
}

/** A paused authoring preview must invalidate when clip state changes without a seek. */
export const ultimate2TimelineConfig = (settings: Ultimate3Settings) => ({
  duration: settings.allocations.ultimate2,
  ...mergeTimelineTiming(MICRO_17_TIMELINE, settings.ultimate2.timing, KEYS17),
});
/** Main-timeline alias of the native Ultimate2 cloud clip (Ultimate2 starts at zero). */
export const ULTIMATE2_CLOUD_KEY = 'ultimate2CloudEnter';
export function ultimate2CloudTimelineConfig(settings: Ultimate3Settings) {
  const clip = mergeTimelineTiming(MICRO_17_TIMELINE, settings.ultimate2.timing, ['cloudEnter']).cloudEnter as ClipTiming;
  return {[ULTIMATE2_CLOUD_KEY]: {...clip, from: {progress: 0}, to: {progress: 1}}};
}
export function ultimate2CloudTimelineValues(settings: Ultimate3Settings) {
  const clip = ultimate2CloudTimelineConfig(settings)[ULTIMATE2_CLOUD_KEY] as ClipTiming;
  return {[`${ULTIMATE2_CLOUD_KEY}.at`]: clip.at, [`${ULTIMATE2_CLOUD_KEY}.duration`]: clip.duration,
    [`${ULTIMATE2_CLOUD_KEY}.from.progress`]: clip.from?.progress ?? 0,
    [`${ULTIMATE2_CLOUD_KEY}.to.progress`]: clip.to?.progress ?? 1,
    [`${ULTIMATE2_CLOUD_KEY}.transition`]: clip.transition};
}
export function settingsFromUltimate2CloudTimeline(timeline: any, settings: Ultimate3Settings) {
  const config = ultimate2CloudTimelineConfig(settings)[ULTIMATE2_CLOUD_KEY] as ClipTiming;
  const authored = normalizeClip(timeline[ULTIMATE2_CLOUD_KEY], config);
  // Native Ultimate2 owns fixed 0→1 endpoints; expose timing/curve edits only.
  const cloudEnter = {at: authored.at, duration: Math.max(.05, authored.duration), transition: authored.transition};
  return normalizeSettings({...settings, ultimate2: {...settings.ultimate2, timing: {...settings.ultimate2.timing, cloudEnter}}});
}

/** Main uses global seconds; Cost detail uses local seconds, one native clip. */
export const COST_CLOUD_KEY = 'cloudsSlideOut';
export function costCloudTimelineConfig(settings: Ultimate3Settings) {
  const clip = costTimelineConfig(settings).cloudSweep as ClipTiming;
  return {[COST_CLOUD_KEY]: {...clip, from: clip.from ?? {progress: 0}, to: clip.to ?? {progress: 1}, at: chapterSchedule(settings)[1].start + clip.at}};
}
export function costCloudTimelineValues(settings: Ultimate3Settings) {
  const clip = costCloudTimelineConfig(settings)[COST_CLOUD_KEY];
  return {[`${COST_CLOUD_KEY}.at`]: clip.at, [`${COST_CLOUD_KEY}.duration`]: clip.duration,
    [`${COST_CLOUD_KEY}.from.progress`]: clip.from?.progress ?? 0,
    [`${COST_CLOUD_KEY}.to.progress`]: clip.to?.progress ?? 1,
    [`${COST_CLOUD_KEY}.transition`]: clip.transition};
}
export function settingsFromCostCloudTimeline(timeline: any, settings: Ultimate3Settings, flat: Record<string, unknown> = {}) {
  const fallback = costCloudTimelineConfig(settings)[COST_CLOUD_KEY];
  const clip = normalizeClip(micro22AuthoredClip(timeline[COST_CLOUD_KEY], COST_CLOUD_KEY, flat), fallback);
  const localAt = Math.max(0, clip.at - chapterSchedule(settings)[1].start);
  const previous = settings.cost.timing.cloudSweep;
  const cloudSweep = {...clip, at: Math.abs(localAt - previous.at) < 1e-9 ? previous.at : localAt, duration: Math.max(.05, clip.duration)};
  // Merely opening the alias must not materialize implicit source endpoints.
  for (const field of ['from', 'to'] as const) if (previous[field] === undefined && JSON.stringify(cloudSweep[field]) === JSON.stringify(fallback[field])) delete cloudSweep[field];
  return normalizeSettings({...settings, cost: {...settings.cost, timing: {...settings.cost.timing, cloudSweep}}});
}

export const costTimelineConfig = (settings: Ultimate3Settings) => ({
  duration: settings.allocations.cost,
  ...mergeTimelineTiming(MICRO_16_TIMELINE, settings.cost.timing, KEYS16),
}) as {duration: number} & Record<typeof KEYS16[number], ClipTiming>;

export function timelinePreviewSignature(timeline: any, keys: readonly string[]) {
  return JSON.stringify([timeline.time, ...keys.map(key => {
    const clip = timeline[key];
    return [key, clip?.at, clip?.duration, clip?.transition, clip?.from, clip?.to, clip?.current?.progress];
  })]);
}

const liveProgress = (timeline: any, key: string, time: number, timing: ClipTiming) =>
  timing.duration === 0 ? Number(time >= timing.at) : timeline[key].current.progress;

/** Live Flow authoring uses clip.current curves while retaining pure instant-clip rules. */
export function liveIssuesPreview(timeline: any, settings: Ultimate3Settings) {
  return sampleIssues(timeline.time, settingsFromIssuesTimeline(timeline, settings)).source20;
}

export function flowTimelineSettings(settings: Ultimate3Settings) {
  const sequel = settings.flow.sourceVersion === 21;
  const comparison = sequel && settings.flow.comparison;
  const keys = (sequel ? FLOW_2_CLIP_KEYS : FLOW_CLIP_KEYS).filter(key => key !== 'cloudReveal' && (!comparison || !(REPLACED_GRAPH_KEYS as readonly string[]).includes(key))
    && !(comparison && comparison.version === 2 && key === 'cameraToEngine'));
  const timing = {...(sequel ? settings.flow.timing21 ?? FLOW_21_TIMING : settings.flow.timing), ...(comparison ? comparison.timing : {})};
  return {
    keys: [...keys, ...(comparison ? COMPARISON_KEYS : [])],
    source: {...(sequel ? FLOW_2_TIMELINE : INTRODUCING_FLOW_1_TIMELINE), ...(comparison ? comparison.timing : {})} as Record<string, unknown>,
    timing: Object.fromEntries([...keys, ...(comparison ? COMPARISON_KEYS : [])].map(key => [key, timing[key as keyof typeof timing]])) as Record<string, ClipTiming>,
  };
}
export function flowTimelineConfig(settings: Ultimate3Settings) {
  const {source, timing, keys} = flowTimelineSettings(settings);
  const entry = settings.flow.entrySlide;
  return {duration: settings.allocations.flow,
    entrySlide: {from: {progress: 0}, to: {progress: 1}, ...entry},
    ...mergeTimelineTiming(source, timing, keys, entry.at + entry.duration)};
}

export function settingsFromFlowTimeline(timeline: any, settings: Ultimate3Settings) {
  const entrySlide = normalizeClip(timeline.entrySlide, settings.flow.entrySlide);
  const entryEnd = entrySlide.at + entrySlide.duration;
  const {keys, timing} = flowTimelineSettings(settings);
  const authored = Object.fromEntries(keys.map(key => {
    const at = Math.max(0, timeline[key].at - entryEnd);
    // Do not rewrite unchanged native timings with subtraction roundoff.
    return [key, normalizeClip({...timeline[key], at: Math.abs(at - timing[key].at) < 1e-9 ? timing[key].at : at}, timing[key])];
  })) as Record<string, ClipTiming>;
  const comparison = settings.flow.comparison;
  const timingKey = settings.flow.sourceVersion === 21 ? 'timing21' : 'timing';
  return normalizeSettings({...settings, flow: {...settings.flow, entrySlide,
    [timingKey]: {...settings.flow[timingKey], ...Object.fromEntries(keys.filter(key => !(COMPARISON_KEYS as readonly string[]).includes(key)).map(key => [key, authored[key]]))},
    ...(comparison ? {comparison: {version: comparison.version, timing: Object.fromEntries(COMPARISON_KEYS.map(key => [key, authored[key]])) as FlowComparison['timing']}} : {}),
  }});
}

export function liveFlowPreview(timeline: any, settings: Ultimate3Settings): ReturnType<typeof sampleFlow> {
  const entry = settings.flow.entrySlide;
  const entryEnd = entry.at + entry.duration;
  const unclippedNativeTime = Math.max(0, timeline.time - entryEnd);
  // Extended chapter allocations are a terminal hold. DialKit's clip.current
  // continues beyond the approved native trim, so use the deterministic
  // endpoint sample there to keep paused authoring identical to export.
  if (unclippedNativeTime >= flowEndpoint(settings)) return sampleFlow(timeline.time, settings);
  const nativeTime = unclippedNativeTime;
  if (settings.flow.sourceVersion === 21) {
    const authored = settingsFromFlowTimeline(timeline, settings);
    const base = sampleFlow(timeline.time, authored);
    const active = new Set(flowTimelineSettings(settings).keys);
    const playback21: Flow2Playback = {time: nativeTime,
      timing: Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => [key, active.has(key)
        ? {at: timeline[key].at - entryEnd, duration: timeline[key].duration} : base.playback21!.timing[key]])) as Flow2Playback['timing'],
      progress: Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => [key, active.has(key) ? timeline[key].current.progress : base.playback21!.progress[key]])) as Flow2Playback['progress'],
    };
    return {...base, entryProgress: liveProgress(timeline, 'entrySlide', timeline.time, entry), nativeTime, playback21, playback: originalFlowPlayback(playback21),
      ...(authored.flow.comparison ? {comparison: sampleFlowComparison(nativeTime, authored.flow.comparison,
        Object.fromEntries(COMPARISON_KEYS.map(key => [key, timeline[key].current.progress])) as Record<ComparisonKey, number>)} : {})};
  }
  const timing = Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, key === 'cloudReveal'
    ? {at: 0, duration: 0}
    : {at: settings.flow.timing[key].at, duration: settings.flow.timing[key].duration},
  ])) as FlowPlayback['timing'];
  const progress = Object.fromEntries(FLOW_CLIP_KEYS.map(key => {
    if (key === 'cloudReveal') return [key, 1];
    return [key, liveProgress(timeline, key, nativeTime, settings.flow.timing[key])];
  })) as Record<FlowClipKey, number>;
  const entryProgress = liveProgress(timeline, 'entrySlide', timeline.time, entry);
  return {entryProgress, nativeTime, playback: {time: nativeTime, timing, progress} as FlowPlayback};
}

export function voiceoverTimelineConfig(settings: Ultimate3Settings, openingOnly = false) {
  if (!settings.voiceover) return {};
  return {narration: Object.fromEntries(VOICEOVER_PHRASES.slice(0, openingOnly ? 6 : undefined).map(phrase => {
    const clip = settings.voiceover!.phrases[phrase.id];
    return [phrase.id, {at: clip.at, duration: clip.duration, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing' as const, duration: clip.duration, ease: [0, 0, 1, 1] as [number, number, number, number]}}];
  }))};
}
export function voiceoverTimelineValues(settings: Ultimate3Settings, openingOnly = false) {
  const group = voiceoverTimelineConfig(settings, openingOnly).narration ?? {};
  return Object.fromEntries(Object.entries(group).flatMap(([id, clip]) => [
    [`narration.${id}.at`, clip.at], [`narration.${id}.duration`, clip.duration],
    [`narration.${id}.transition`, clip.transition],
    [`narration.${id}.from.progress`, 0], [`narration.${id}.to.progress`, 1],
  ]));
}
export function voiceoverTimelineSignature(timeline: any, openingOnly = false) {
  return JSON.stringify(VOICEOVER_PHRASES.slice(0, openingOnly ? 6 : undefined).map(phrase => {
    const value = timeline.narration?.[phrase.id];
    return [value?.at, value?.duration, value?.transition, value?.from, value?.to];
  }));
}
export function settingsFromVoiceoverTimeline(timeline: any, settings: Ultimate3Settings, openingOnly = false) {
  if (!settings.voiceover) return settings;
  const phrases = {...settings.voiceover.phrases};
  for (const phrase of VOICEOVER_PHRASES.slice(0, openingOnly ? 6 : undefined)) {
    const clip = timeline.narration?.[phrase.id];
    if (clip) phrases[phrase.id] = {at: clip.at, duration: clip.duration};
  }
  return normalizeSettings({...settings, voiceover: {...settings.voiceover, phrases}});
}

export function cloudTimelineConfig(settings: Ultimate3Settings) {
  return Object.fromEntries(CLOUD_KEYS.map(key => {
    const clip = settings.clouds!.timing[key];
    return [key, {...clip, from: clip.from ?? {progress: 0}, to: clip.to ?? {progress: 1},
      transition: clip.transition ?? {type: 'easing' as const, duration: clip.duration, ease: [0, 0, 1, 1] as [number, number, number, number]}}];
  })) as Record<typeof CLOUD_KEYS[number], ClipTiming>;
}
export function cloudTimelineValues(settings: Ultimate3Settings) {
  const config = cloudTimelineConfig(settings);
  return Object.fromEntries(CLOUD_KEYS.flatMap(key => {
    const clip = config[key];
    return [[`${key}.at`, clip.at], [`${key}.duration`, clip.duration],
      [`${key}.from.progress`, clip.from!.progress], [`${key}.to.progress`, clip.to!.progress],
      [`${key}.transition`, clip.transition]];
  }));
}
export function settingsFromCloudTimeline(timeline: any, settings: Ultimate3Settings) {
  const config = cloudTimelineConfig(settings);
  const timing = Object.fromEntries(CLOUD_KEYS.map(key => {
    const clip = normalizeClip(timeline[key], config[key]);
    for (const field of ['from', 'to', 'transition'] as const) {
      if (settings.clouds!.timing[key][field] === undefined
        && JSON.stringify(clip[field]) === JSON.stringify(config[key][field])) delete clip[field];
    }
    return [key, clip];
  }));
  return normalizeSettings({...settings, clouds: {...settings.clouds!, timing}});
}

export const CONCLUSION_TIMELINE_KEYS = ['placeholder', 'logo'] as const;
type ConclusionKey = typeof CONCLUSION_TIMELINE_KEYS[number] | 'url';
/** The url card is a bar only on cuts that have one. */
export const conclusionTimelineKeys = (settings: Ultimate3Settings): ConclusionKey[] => settings.conclusion.url ? [...CONCLUSION_TIMELINE_KEYS, 'url'] : [...CONCLUSION_TIMELINE_KEYS];
export function conclusionTimelineConfig(settings: Ultimate3Settings) {
  const clips = Object.fromEntries(conclusionTimelineKeys(settings).map(key => {
    const clip = settings.conclusion[key]!;
    return [key, {...clip, from: clip.from ?? {progress: 0}, to: clip.to ?? {progress: 1},
      transition: clip.transition ?? {type: 'easing' as const, duration: clip.duration,
        ease: (key === 'placeholder' ? [.45, 0, .55, 1] : [0, 0, 1, 1]) as [number, number, number, number]}}];
  })) as Record<ConclusionKey, ClipTiming>;
  return {duration: settings.allocations.conclusion, ...clips};
}
export function conclusionTimelineValues(settings: Ultimate3Settings) {
  const config = conclusionTimelineConfig(settings);
  return Object.fromEntries(conclusionTimelineKeys(settings).flatMap(key => {
    const clip = config[key];
    return [[`${key}.at`, clip.at], [`${key}.duration`, clip.duration],
      [`${key}.from.progress`, clip.from!.progress], [`${key}.to.progress`, clip.to!.progress],
      [`${key}.transition`, clip.transition]];
  }));
}
export function settingsFromConclusionTimeline(timeline: any, settings: Ultimate3Settings) {
  const config = conclusionTimelineConfig(settings);
  const conclusion = Object.fromEntries(conclusionTimelineKeys(settings).map(key => {
    const authored = normalizeClip(timeline[key], config[key]);
    // Display defaults must not become persisted edits merely by opening the panel.
    // Keep absent curves absent on retiming so the sampler uses the new duration.
    for (const field of ['from', 'to', 'transition'] as const) {
      if (settings.conclusion[key]![field] === undefined
        && JSON.stringify(authored[field]) === JSON.stringify(config[key][field])) delete authored[field];
    }
    return [key, authored];
  }));
  return normalizeSettings({...settings, conclusion});
}

export const ISSUES_TIMELINE_KEYS = ['leadIn', ...PRELUDE_KEYS.map(key => `prelude_${key}`), ...ISSUE_KEYS.map(key => `postlude_${key}`)];
export const issuesTimelineKeys = (settings: Ultimate3Settings) => settings.issues.sourceVersion === 22 ? ['leadIn', ...MICRO_22_KEYS.map(key => `report_${key}`), ...ISSUE_KEYS.map(key => `postlude_${key}`)] : ISSUES_TIMELINE_KEYS;
export function issuesTimelineConfig(settings: Ultimate3Settings) {
  if (settings.issues.sourceVersion === 22) return {duration: settings.allocations.issues, leadIn: settings.issues.leadIn,
    ...Object.fromEntries(Object.entries(normalizeMicro22Timing(settings.issues.timing22)).map(([key, clip]) => [`report_${key}`, {...clip, at: clip.at + issueEntryEnd(settings)}])),
    ...Object.fromEntries(ISSUE_KEYS.map(key => [`postlude_${key}`, {...settings.issues.timing[key], at: issuePostludeOffset(settings) + settings.issues.timing[key].at}]))};
  return {duration: settings.allocations.issues, leadIn: settings.issues.leadIn,
    ...Object.fromEntries(PRELUDE_KEYS.map(key => [`prelude_${key}`, {...settings.issues.preludeTiming[key], at: issueEntryEnd(settings) + settings.issues.preludeTiming[key].at}])),
    ...Object.fromEntries(ISSUE_KEYS.map(key => [`postlude_${key}`, {...settings.issues.timing[key], at: issuePostludeOffset(settings) + settings.issues.timing[key].at}])),
  };
}
export function issuesTimelineValues(settings: Ultimate3Settings): Record<string, any> {
  const config = issuesTimelineConfig(settings) as Record<string, any>;
  return Object.fromEntries(issuesTimelineKeys(settings).flatMap(key => {
    const clip = config[key];
    return [[`${key}.at`, clip.at], [`${key}.duration`, clip.duration],
      ...clip.transition ? [[`${key}.transition`, clip.transition]] : [],
      ...clip.from ? [[`${key}.from.progress`, clip.from.progress]] : [],
      ...clip.to ? [[`${key}.to.progress`, clip.to.progress]] : []];
  }));
}
/** Bars are chapter seconds; each source20 part keeps its own native seconds.
 * When a dependency moves, downstream bars ripple instead of being reinterpreted. */
export function settingsFromIssuesTimeline(timeline: any, settings: Ultimate3Settings, flat: Record<string, unknown> = {}) {
  const i = settings.issues;
  const leadIn = normalizeClip(i.sourceVersion === 22 && timeline.leadIn ? micro22AuthoredClip(timeline.leadIn, 'leadIn', flat) : timeline.leadIn, i.leadIn);
  const withEntry = normalizeSettings({...settings, issues: {...i, leadIn}});
  const extract = (key: string, fallback: ClipTiming, oldOffset: number, newOffset: number) => {
    if (!timeline[key]) return fallback;
    const previous = {...fallback, at: fallback.at + oldOffset};
    const authored = normalizeClip(i.sourceVersion === 22 ? micro22AuthoredClip(timeline[key], key, flat)
      : flat[`${key}.transition`] ? {...timeline[key], transition: flat[`${key}.transition`]} : timeline[key], previous);
    // An unchanged downstream bar is a dependency ripple, not a negative
    // native-time edit. Changed bars in a full preset/import use its NEW offset.
    const sameAt = Math.abs(authored.at - previous.at) < 1e-9;
    if (sameAt && JSON.stringify({...authored, at: 0}) === JSON.stringify({...normalizeClip(previous, previous), at: 0})) return fallback;
    const at = sameAt ? fallback.at : Math.max(0, authored.at - newOffset);
    return {...authored, at: Math.abs(at - fallback.at) < 1e-9 ? fallback.at : at};
  };
  if (i.sourceVersion === 22) {
    const previous = normalizeMicro22Timing(i.timing22);
    const timing22 = Object.fromEntries(MICRO_22_KEYS.map(key => [key, extract(`report_${key}`, previous[key], issueEntryEnd(settings), issueEntryEnd(withEntry))]));
    const interim = normalizeSettings({...withEntry, issues: {...withEntry.issues, timing22}});
    const timing = Object.fromEntries(ISSUE_KEYS.map(key => [key, extract(`postlude_${key}`, i.timing[key], issuePostludeOffset(settings), issuePostludeOffset(interim))]));
    return normalizeSettings({...interim, issues: {...interim.issues, timing}});
  }
  const preludeTiming = Object.fromEntries(PRELUDE_KEYS.map(key => [key,
    extract(`prelude_${key}`, i.preludeTiming[key], issueEntryEnd(settings), issueEntryEnd(withEntry))]));
  const interim = normalizeSettings({...withEntry, issues: {...withEntry.issues, preludeTiming}});
  const timing = Object.fromEntries(ISSUE_KEYS.map(key => [key,
    extract(`postlude_${key}`, i.timing[key], issuePostludeOffset(settings), issuePostludeOffset(interim))]));
  return normalizeSettings({...interim, issues: {...interim.issues, timing}});
}
