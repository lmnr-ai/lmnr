import {useCurrentFrame} from 'remotion';
import {Micro16Scene} from '../experiments/micro-16/Scene';
import {sampleMicro16Frame} from '../experiments/micro-16/sample';
import {DEFAULTS, DEFAULT_TIMING, type Controls, type Timing} from '../experiments/micro-16/timeline';

export type MicroAnimation16Props = {controls: Controls; timing: Timing};
export const MICRO_16_VIDEO_DEFAULTS: MicroAnimation16Props = {controls: DEFAULTS, timing: DEFAULT_TIMING};
export const MicroAnimation16 = ({controls = DEFAULTS, timing = DEFAULT_TIMING}: MicroAnimation16Props) =>
  <Micro16Scene state={sampleMicro16Frame(useCurrentFrame(), controls, timing)}/>;
