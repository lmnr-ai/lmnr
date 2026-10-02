import {
  computeClipState,
  computeStaticTimeline,
  parseTimelineConfig,
  type TimelineConfig,
} from 'dialkit/timeline';
import type {DialValue} from 'dialkit/store';

// Bump when the timeline's clip structure/default timing changes. DialKit persistence
// intentionally overrides source defaults for an existing stable ID.
export const PANEL_ID = 'micro-animation-01-timeline-v3';

const comet = (at: number, duration: number) => ({
  at,
  duration,
  from: {progress: 0, tailLength: 0.24, intensity: 1},
  to: {progress: 1.2, tailLength: 0.24, intensity: 1},
  transition: {type: 'easing' as const, duration, ease: [0.45, 0, 0.2, 1] as [number, number, number, number]},
});

export const TIMELINE = {
  duration: 4,
  orangeComet: comet(0.65, 3.35),
  leftWhiteComet: comet(0, 2.52),
  lowerWhiteComet: comet(0.35, 2.67),
  upperWhiteComet: comet(0.66, 2.88),
} satisfies TimelineConfig;

export type DialValues = Record<string, DialValue>;

export interface CometSample {
  progress: number;
  tailLength: number;
  intensity: number;
}

export interface MicroSample {
  orangeComet: CometSample;
  leftWhiteComet: CometSample;
  lowerWhiteComet: CometSample;
  upperWhiteComet: CometSample;
}

export const createSampler = (values: DialValues = {}) => {
  const parsed = parseTimelineConfig(TIMELINE);
  const {clips, duration} = computeStaticTimeline(parsed, values);

  return {
    duration,
    at: (time: number) =>
      Object.fromEntries(
        clips.map((clip) => [
          clip.key,
          (computeClipState(clip, time, time) as {current: unknown}).current,
        ]),
      ) as unknown as MicroSample,
  };
};
