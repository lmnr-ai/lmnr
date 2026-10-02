import {useCurrentFrame, useVideoConfig} from 'remotion';
import {MICRO_11_DEFAULTS, sampleMicro11, type Micro11Controls} from '../experiments/micro-11/geometry';
import {Micro11Scene} from '../experiments/micro-11/Scene';
import {sampleMicro11Transition} from '../experiments/micro-11/sample';

export type MicroAnimation11Props = Micro11Controls;

export const MicroAnimation11 = (props: MicroAnimation11Props) => {
  const {fps} = useVideoConfig();
  const time = useCurrentFrame() / fps;
  return <Micro11Scene {...sampleMicro11(time, props, sampleMicro11Transition(time))}/>;
};

export const MICRO_11_VIDEO_DEFAULTS: MicroAnimation11Props = MICRO_11_DEFAULTS;
