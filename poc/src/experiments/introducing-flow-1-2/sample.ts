import {computeClipState, computeStaticTimeline, parseTimelineConfig, type TimelineClipConfig, type TimelineConfig} from 'dialkit/timeline';
import type {FlowPlayback, FlowProgress, FlowTiming} from '../introducing-flow-1/sample';
import {FLOW_CLIP_KEYS} from '../introducing-flow-1/timeline';
import {FLOW_2_CLIP_KEYS, FLOW_2_TIMELINE, type Flow2ClipKey} from './timeline';

export type Flow2Playback = {
  time: number;
  progress: Record<Flow2ClipKey, number>;
  timing: Record<Flow2ClipKey, {at: number; duration: number}>;
};
export type Flow2LiveTimeline = {time: number; duration: number} & Record<Flow2ClipKey, {
  at: number; duration: number; current: {progress: number};
  from?: TimelineClipConfig['from']; to?: TimelineClipConfig['to']; transition?: TimelineClipConfig['transition'];
}>;

export function createFlow2Sampler(config: TimelineConfig = FLOW_2_TIMELINE) {
  const resolved = computeStaticTimeline(parseTimelineConfig({...FLOW_2_TIMELINE, ...config}), {});
  const timing = Object.fromEntries(resolved.clips.map(clip => [clip.key, {at: clip.at, duration: clip.duration}])) as Flow2Playback['timing'];
  return {
    duration: resolved.duration,
    sample(time: number): Flow2Playback {
      return {time, timing, progress: Object.fromEntries(resolved.clips.map(clip => [clip.key,
        (computeClipState(clip, time, time).current as {progress: number}).progress])) as Flow2Playback['progress']};
    },
  };
}
const defaults = createFlow2Sampler();
export const sampleFlow2 = defaults.sample;
export const flow2DurationFrames = (config: TimelineConfig = FLOW_2_TIMELINE) => Math.ceil(createFlow2Sampler(config).duration * 30);

/** Bind the actual retained clip.current values, not a second default clock. */
export function liveFlow2(timeline: Flow2LiveTimeline): Flow2Playback {
  return {time: timeline.time,
    timing: Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => [key, {at: timeline[key].at, duration: timeline[key].duration}])) as Flow2Playback['timing'],
    progress: Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => [key, timeline[key].current.progress])) as Flow2Playback['progress']};
}

/** An explicit snapshot for static inspection / Remotion; preserve full curves. */
export function flow2TimelineConfig(timeline: Flow2LiveTimeline): TimelineConfig {
  return {duration: timeline.duration, ...Object.fromEntries(FLOW_2_CLIP_KEYS.map(key => {
    const clip = timeline[key];
    return [key, {at: clip.at, duration: clip.duration, from: clip.from, to: clip.to, transition: clip.transition}];
  }))};
}

/** Compatibility adapter for the unchanged title, cloud, engine and captions.
 * Removed percentage/bar tracks are neutral, never presented as editable no-ops.
 */
export function originalFlowPlayback(playback: Flow2Playback): FlowPlayback {
  const values = playback.progress as Partial<FlowProgress>;
  const timing = playback.timing as Partial<FlowTiming>;
  return {time: playback.time,
    progress: Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, values[key] ?? 0])) as FlowProgress,
    timing: Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, timing[key] ?? {at: 0, duration: 0}])) as FlowTiming};
}
