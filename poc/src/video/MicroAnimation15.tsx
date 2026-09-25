import {useCurrentFrame} from 'remotion';
import {Micro15Scene} from '../experiments/micro-15/Scene';
import {sampleMicro15Frame} from '../experiments/micro-15/sample';
import {MICRO_15_DEFAULTS, MICRO_15_TIMING, type Micro15Controls, type Micro15Timing} from '../experiments/micro-15/timeline';

export type MicroAnimation15Props = Micro15Controls & {timing: Micro15Timing};
export const MICRO_15_VIDEO_DEFAULTS: MicroAnimation15Props = {...MICRO_15_DEFAULTS, timing: MICRO_15_TIMING};
export const MicroAnimation15 = ({timing, ...controls}: MicroAnimation15Props) =>
  <Micro15Scene {...sampleMicro15Frame(useCurrentFrame(), controls, timing)}/>;
