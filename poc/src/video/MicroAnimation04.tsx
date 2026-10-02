import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Micro04Scene} from '../experiments/micro-04/Scene';
import {MICRO_04_TIMELINE, type Micro04Values} from '../experiments/micro-04/timeline';

const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_04_TIMELINE), {});

const sample = (time: number) => Object.fromEntries(
  clips.map((clip) => [
    clip.key,
    (computeClipState(clip, time, time) as {current: {progress: number}}).current.progress,
  ]),
) as unknown as Micro04Values;

export const MicroAnimation04 = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  return (
    <Micro04Scene
      time={time}
      values={sample(time)}
      lightnessOffset={-5}
      ellipsisInterval={0.15}
      finalFrameSize={148}
      logoScaleDestination={48}
      logoBlurPeak={28}
    />
  );
};
