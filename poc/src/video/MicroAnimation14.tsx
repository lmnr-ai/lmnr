import {useCurrentFrame} from 'remotion';
import {sampleMicro14Frame} from '../experiments/micro-14/sample';
import {Micro14Scene} from '../experiments/micro-14/Scene';
import {MICRO_14_DEFAULTS, MICRO_14_TIMING, type Micro14Controls, type Micro14Timing} from '../experiments/micro-14/timeline';

export type MicroAnimation14Props = Micro14Controls & {timing: Micro14Timing};
export const MICRO_14_VIDEO_DEFAULTS: MicroAnimation14Props = {...MICRO_14_DEFAULTS, timing: MICRO_14_TIMING};
export const MicroAnimation14 = ({timing, ...controls}: MicroAnimation14Props) =>
  <Micro14Scene {...sampleMicro14Frame(useCurrentFrame(), controls, timing)}/>;
