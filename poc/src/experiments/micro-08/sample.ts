import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {positiveModulo, SPEED, TILE_PERIOD, streamPhase} from './geometry';
import {MICRO_08_TIMELINE} from './timeline';
import {sampleDither} from './dither';
import {readOutro} from './outro';

const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_08_TIMELINE), {});
// Stream phase is periodic, independent of the finite composition's duration.
// Reduce time before multiplication to preserve precision on large/reverse seeks.
export function sampleStreamers(time: number) {
  return streamPhase(positiveModulo(time, TILE_PERIOD / SPEED) * SPEED);
}

export function sampleMicro08(time: number) {
  return {
    ...sampleStreamers(time), dither: sampleDither(time),
    // The outro clamps at its endpoints; it must NOT wrap back into streamers.
    outro: readOutro(key => (computeClipState(clips.find(clip => clip.key === key)!, time, time) as {current: {progress: number}}).current.progress),
  };
}
