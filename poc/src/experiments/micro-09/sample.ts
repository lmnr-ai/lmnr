import {Easing, interpolate} from 'remotion';
import {MICRO_09_DURATION} from './timeline';

const ease = Easing.bezier(.45, 0, .55, 1);

export function sampleMicro09(time: number) {
  const clampedTime = Math.max(0, Math.min(MICRO_09_DURATION, time));
  return {
    time: clampedTime,
    progress: interpolate(clampedTime, [0, MICRO_09_DURATION], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease,
    }),
  };
}
