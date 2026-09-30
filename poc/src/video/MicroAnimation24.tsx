import {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {TimelineConfig} from 'dialkit/timeline';
import {FLOW_3_APPEARANCE, IntroducingFlow3Scene, type Flow3Appearance} from '../experiments/micro-24/Scene';
import {createFlow3Sampler} from '../experiments/micro-24/sample';
import {FLOW_3_TIMELINE} from '../experiments/micro-24/timeline';

export type Micro24Props = Flow3Appearance & {timeline: TimelineConfig};
export const FLOW_3_VIDEO_DEFAULTS: Micro24Props = {...FLOW_3_APPEARANCE, timeline: FLOW_3_TIMELINE};
export const MicroAnimation24 = ({timeline, ...appearance}: Micro24Props) => {
  const frame = useCurrentFrame(), {fps} = useVideoConfig();
  const sampler = useMemo(() => createFlow3Sampler(timeline), [timeline]);
  return <AbsoluteFill><IntroducingFlow3Scene playback={sampler.sample(frame / fps)} {...appearance}/></AbsoluteFill>;
};
