import {computeClipState} from 'dialkit/timeline';
import {CLIP_KEYS, normalizeTiming, resolveClips, timelineEnd, type ClipKey, type Timing} from './timeline';

export type Progress = Record<ClipKey, number>;
export type Playback = {time: number; progress: Progress; streamDuration: number; smokeTime: number};
export const safeTime = (time: number) => Number.isFinite(time) ? Math.max(0, time) : 0;
// Decimal clip boundaries can differ by a floating-point ULP (16.8 + 1.4).
const clamp = (value: number) => value < 1e-9 ? 0 : value > 1 - 1e-9 ? 1 : value;
const playback = (time: number, timing: Timing, progress: Progress): Playback => ({time, progress,
  streamDuration: timing.streamRun.duration, smokeTime: Math.max(0, time - timing.smokeEnter.at)});

// Pure shared export/inspection sampler. Zero-duration bars are true steps,
// rather than DialKit's minimum .05s visual duration. No wall clock state.
export function sampleMicro17(timeInput: number, timingInput: Partial<Timing> = {}): Playback {
  const timing = normalizeTiming(timingInput);
  const time = Math.min(safeTime(timeInput), timelineEnd(timing));
  const progress = Object.fromEntries(resolveClips(timing).map(clip => {
    const authored = timing[clip.key as ClipKey];
    return [clip.key, authored.duration === 0 ? Number(time >= authored.at)
      : clamp((computeClipState(clip, time, time) as {current: {progress: number}}).current.progress)];
  })) as Progress;
  return playback(time, timing, progress);
}

export type LiveTimeline = {time: number} & Record<ClipKey, Timing[ClipKey] & {current: {progress: number}}>;
// Live authoring must consume clip.current, including edited easing curves.
// Geometry and renderer remain identical to the static/Remotion path.
export function livePlayback(timeline: LiveTimeline): Playback {
  const timing = normalizeTiming(timeline);
  const time = Math.min(safeTime(timeline.time), timelineEnd(timing));
  const progress = Object.fromEntries(CLIP_KEYS.map(key => [key, timing[key].duration === 0
    ? Number(time >= timing[key].at) : clamp(timeline[key].current.progress)])) as Progress;
  return playback(time, timing, progress);
}
