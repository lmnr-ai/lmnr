import {useCurrentFrame, useVideoConfig} from 'remotion';
import {DEFAULTS, type Controls} from '../experiments/micro-17/geometry';
import {sampleMicro17} from '../experiments/micro-17/sample';
import {Micro17Scene} from '../experiments/micro-17/Scene';
import {DEFAULT_TIMING, type Timing} from '../experiments/micro-17/timeline';

export type MicroAnimation17Props = {controls: Controls; timing: Timing};
export const MICRO_17_VIDEO_DEFAULTS: MicroAnimation17Props = {controls: DEFAULTS, timing: DEFAULT_TIMING};
export const MicroAnimation17 = ({controls = DEFAULTS, timing = DEFAULT_TIMING}: MicroAnimation17Props) => {
  const {fps} = useVideoConfig();
  return <Micro17Scene playback={sampleMicro17(useCurrentFrame() / fps, timing)} controls={controls}/>;
};
