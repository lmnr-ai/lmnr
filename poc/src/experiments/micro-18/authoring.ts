import type {FlowPlayback} from '../introducing-flow-1/sample';
import {FLOW_CLIP_KEYS, type FlowClipKey} from '../introducing-flow-1/timeline';
import {sampleFlow} from './sample';
import {flowEndpoint} from './settings';
import {CLIP_KEYS as KEYS17, MICRO_17_TIMELINE} from '../micro-17/timeline';
import {CLIP_KEYS as KEYS16, MICRO_16_TIMELINE} from '../micro-16/timeline';
import type {ClipTiming, Ultimate3Settings} from './settings';
import {sampleMicro15Live} from '../micro-15/sample';

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
export const costTimelineConfig = (settings: Ultimate3Settings) => ({
  duration: settings.allocations.cost,
  ...mergeTimelineTiming(MICRO_16_TIMELINE, settings.cost.timing, KEYS16),
});

export function timelinePreviewSignature(timeline: any, keys: readonly string[]) {
  return JSON.stringify([timeline.time, ...keys.map(key => {
    const clip = timeline[key];
    return [key, clip?.at, clip?.duration, clip?.transition, clip?.current?.progress];
  })]);
}

const liveProgress = (timeline: any, key: string, time: number, timing: ClipTiming) =>
  timing.duration === 0 ? Number(time >= timing.at) : timeline[key].current.progress;

/** Live Flow authoring uses clip.current curves while retaining pure instant-clip rules. */
export function liveIssuesPreview(timeline: any, settings: Ultimate3Settings) {
  const leadEnd = settings.issues.leadIn.at + settings.issues.leadIn.duration;
  const nativeTime = Math.max(0, timeline.time - leadEnd);
  return sampleMicro15Live(nativeTime, settings.issues.controls, settings.issues.timing, timeline);
}

export function liveFlowPreview(timeline: any, settings: Ultimate3Settings) {
  const entry = settings.flow.entrySlide;
  const entryEnd = entry.at + entry.duration;
  const unclippedNativeTime = Math.max(0, timeline.time - entryEnd);
  // Extended chapter allocations are a terminal hold. DialKit's clip.current
  // continues beyond the approved native trim, so use the deterministic
  // endpoint sample there to keep paused authoring identical to export.
  if (unclippedNativeTime >= flowEndpoint(settings)) return sampleFlow(timeline.time, settings);
  const nativeTime = unclippedNativeTime;
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
