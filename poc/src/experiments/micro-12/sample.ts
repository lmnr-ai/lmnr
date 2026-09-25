import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {CLIP_KEYS, MICRO_12_TIMELINE, type ClipKey} from './timeline';

export type Progress = Record<ClipKey, number>;
export type Playback = {time: number; progress: Progress; streamDuration: number};
const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_12_TIMELINE), {});

export function sampleMicro12(time: number): Playback {
  const progress = Object.fromEntries(clips.map(clip => [clip.key,
    (computeClipState(clip, time, time) as {current: {progress: number}}).current.progress])) as Progress;
  return {time, progress, streamDuration: MICRO_12_TIMELINE.streamRun.duration};
}

// Preview and export enter through the same seam. Live duration is important:
// retiming streamRun must preserve the dial's pixels-per-second speed.
export function livePlayback(timeline: {time: number} & Record<ClipKey, {current: {progress: number}; duration: number}>): Playback {
  return {time: timeline.time, streamDuration: timeline.streamRun.duration,
    progress: Object.fromEntries(CLIP_KEYS.map(key => [key, timeline[key].current.progress])) as Progress};
}
