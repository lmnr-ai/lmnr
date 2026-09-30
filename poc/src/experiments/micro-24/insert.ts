import {sampleMicro23Progress, clamp01} from '../micro-23/sample';
import {MICRO_23_DEFAULTS, MICRO_23_KEYS, type Micro23Key} from '../micro-23/timeline';
import {MICRO23_TRACKS} from './timeline';
import type {Flow3Playback} from './sample';

/** One clock: both live clip.current and Remotion supply the same progress/timing. */
export function flow3Insert(playback: Flow3Playback) {
  const progress = Object.fromEntries(MICRO_23_KEYS.map(key => [key, playback.progress[MICRO23_TRACKS[key]]])) as Record<Micro23Key, number>;
  const starts = Object.fromEntries(MICRO_23_KEYS.map(key => [key, playback.timing[MICRO23_TRACKS[key]].at])) as Record<Micro23Key, number>;
  const durations = Object.fromEntries(MICRO_23_KEYS.map(key => [key, playback.timing[MICRO23_TRACKS[key]].duration])) as Record<Micro23Key, number>;
  const sample = sampleMicro23Progress(playback.time, progress, MICRO_23_DEFAULTS, starts, durations);
  const density = clamp01(progress.gridShrink) * (1 - clamp01(progress.returnToGrid));
  return {
    sample,
    active: playback.time >= Math.min(...Object.values(starts)) && playback.time < playback.timing.cameraToEngine.at,
    gridStrokeWidth: 1 - .5 * density,
  };
}
