import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Micro05Scene} from '../experiments/micro-05/Scene';
import {MICRO_05_TIMELINE} from '../experiments/micro-05/timeline';

const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_05_TIMELINE), {});
const progressAt = (key: string, time: number) => {
  const clip = clips.find((item) => item.key === key)!;
  return (computeClipState(clip, time, time) as {current: {progress: number}}).current.progress;
};

export const MicroAnimation05 = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;
  return (
    <Micro05Scene
      waveProgress={progressAt('wave', time)}
      clusterProgress={[
        progressAt('cluster1', time),
        progressAt('cluster2', time),
        progressAt('cluster3', time),
      ]}
    />
  );
};
