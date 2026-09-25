import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE, type FlowClipKey} from './timeline';

export type FlowProgress = Record<FlowClipKey, number>;
export type FlowTiming = Record<FlowClipKey, {at: number; duration: number}>;
export type FlowPlayback = {time: number; progress: FlowProgress; timing: FlowTiming};
const {clips} = computeStaticTimeline(parseTimelineConfig(INTRODUCING_FLOW_1_TIMELINE), {});
const staticTiming = Object.fromEntries(clips.map(clip => [clip.key, {at: clip.at, duration: clip.duration}])) as FlowTiming;

export function sampleIntroducingFlow1(time: number): FlowPlayback {
  const progress = Object.fromEntries(clips.map(clip => [clip.key,
    (computeClipState(clip, time, time) as {current: {progress: number}}).current.progress])) as FlowProgress;
  return {time, progress, timing: staticTiming};
}

type LiveClip = {at: number; duration: number; current: {progress: number}};
export function liveIntroducingFlow1(timeline: {time: number} & Record<FlowClipKey, LiveClip>): FlowPlayback {
  return {
    time: timeline.time,
    progress: Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, timeline[key].current.progress])) as FlowProgress,
    timing: Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, {at: timeline[key].at, duration: timeline[key].duration}])) as FlowTiming,
  };
}
