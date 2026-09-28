import {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimelineConfig} from 'dialkit/timeline';
import {FLOW_2_APPEARANCE, IntroducingFlow2Scene, type Flow2Appearance} from '../experiments/introducing-flow-1-2/Scene';
import {createFlow2Sampler} from '../experiments/introducing-flow-1-2/sample';
import {FLOW_2_TIMELINE} from '../experiments/introducing-flow-1-2/timeline';

export type IntroducingFlow2Props = Flow2Appearance & {timeline: TimelineConfig};
export const FLOW_2_VIDEO_DEFAULTS: IntroducingFlow2Props = {...FLOW_2_APPEARANCE, timeline: FLOW_2_TIMELINE};
export const IntroducingFlow2 = ({timeline, ...appearance}: IntroducingFlow2Props) => {
  const frame = useCurrentFrame(), {fps} = useVideoConfig();
  const sampler = useMemo(() => createFlow2Sampler(timeline), [timeline]);
  return <AbsoluteFill><IntroducingFlow2Scene playback={sampler.sample(frame / fps)} {...appearance}/></AbsoluteFill>;
};
