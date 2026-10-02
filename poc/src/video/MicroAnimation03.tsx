import {useCurrentFrame, useVideoConfig} from 'remotion';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {Micro03Scene} from '../experiments/micro-03/Scene';
import {MICRO_03_TIMELINE, type Micro03Values} from '../experiments/micro-03/timeline';

const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_03_TIMELINE), {});

const sample = (time: number) => Object.fromEntries(
  clips.map((clip) => [
    clip.key,
    (computeClipState(clip, time, time) as {current: {progress: number}}).current.progress,
  ]),
) as unknown as Micro03Values;

export const MicroAnimation03 = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  return <Micro03Scene time={time} values={sample(time)} />;
};
