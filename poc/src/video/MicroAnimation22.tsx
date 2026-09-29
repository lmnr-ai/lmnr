import {useCurrentFrame} from 'remotion';
import {Micro22Scene} from '../experiments/micro-22/Scene';
import {sampleMicro22} from '../experiments/micro-22/sample';
import {MICRO_22_DEFAULTS, MICRO_22_TIMING, type Micro22Props} from '../experiments/micro-22/timeline';
export const MICRO_22_VIDEO_DEFAULTS: Micro22Props = {timing: MICRO_22_TIMING, controls: MICRO_22_DEFAULTS};
export const MicroAnimation22 = (props: Micro22Props) => <Micro22Scene sample={sampleMicro22(useCurrentFrame() / 30, props)}/>;
