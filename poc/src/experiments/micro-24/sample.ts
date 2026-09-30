import {computeClipState, computeStaticTimeline, parseTimelineConfig, type TimelineClipConfig, type TimelineConfig} from 'dialkit/timeline';
import type {FlowPlayback, FlowProgress, FlowTiming} from '../introducing-flow-1/sample';
import {FLOW_CLIP_KEYS} from '../introducing-flow-1/timeline';
import {FLOW_3_CLIP_KEYS, FLOW_3_TIMELINE, type Flow3ClipKey} from './timeline';

export type Flow3Playback = {
  time: number;
  progress: Record<Flow3ClipKey, number>;
  timing: Record<Flow3ClipKey, {at: number; duration: number}>;
};
export type Flow3LiveTimeline = {time: number; duration: number} & Record<Flow3ClipKey, {
  at: number; duration: number; current: {progress: number};
  from?: TimelineClipConfig['from']; to?: TimelineClipConfig['to']; transition?: TimelineClipConfig['transition'];
}>;

export function createFlow3Sampler(config: TimelineConfig = FLOW_3_TIMELINE) {
  const resolved = computeStaticTimeline(parseTimelineConfig({...FLOW_3_TIMELINE, ...config}), {});
  const timing = Object.fromEntries(resolved.clips.map(clip => [clip.key, {at: clip.at, duration: clip.duration}])) as Flow3Playback['timing'];
  return {
    duration: resolved.duration,
    sample(time: number): Flow3Playback {
      return {time, timing, progress: Object.fromEntries(resolved.clips.map(clip => [clip.key,
        (computeClipState(clip, time, time).current as {progress: number}).progress])) as Flow3Playback['progress']};
    },
  };
}
const defaults = createFlow3Sampler();
export const sampleFlow3 = defaults.sample;
export const flow3DurationFrames = (config: TimelineConfig = FLOW_3_TIMELINE) => Math.ceil(createFlow3Sampler(config).duration * 30);

/** Bind the actual retained clip.current values, not a second default clock. */
export function liveFlow3(timeline: Flow3LiveTimeline): Flow3Playback {
  return {time: timeline.time,
    timing: Object.fromEntries(FLOW_3_CLIP_KEYS.map(key => [key, {at: timeline[key].at, duration: timeline[key].duration}])) as Flow3Playback['timing'],
    progress: Object.fromEntries(FLOW_3_CLIP_KEYS.map(key => [key, timeline[key].current.progress])) as Flow3Playback['progress']};
}

/** An explicit snapshot for static inspection / Remotion; preserve full curves. */
export function flow3TimelineConfig(timeline: Flow3LiveTimeline): TimelineConfig {
  return {duration: timeline.duration, ...Object.fromEntries(FLOW_3_CLIP_KEYS.map(key => {
    const clip = timeline[key];
    return [key, {at: clip.at, duration: clip.duration, from: clip.from, to: clip.to, transition: clip.transition}];
  }))};
}

/** Compatibility adapter for the unchanged title, cloud, engine and captions.
 * Removed percentage/bar tracks are neutral, never presented as editable no-ops.
 */
export function originalFlowPlayback(playback: Flow3Playback): FlowPlayback {
  const values = playback.progress as Partial<FlowProgress>;
  const timing = playback.timing as Partial<FlowTiming>;
  return {time: playback.time,
    progress: Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, values[key] ?? 0])) as FlowProgress,
    timing: Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, timing[key] ?? {at: 0, duration: 0}])) as FlowTiming};
}
