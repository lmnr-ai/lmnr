import {useMemo} from 'react';
import {useCurrentFrame} from 'remotion';
import {Micro23Scene} from '../experiments/micro-23/Scene';
import {createMicro23Sampler} from '../experiments/micro-23/sample';
import {MICRO_23_DEFAULTS, type Micro23Props} from '../experiments/micro-23/timeline';

export const MICRO_23_VIDEO_DEFAULTS: Micro23Props = {values: {}, controls: MICRO_23_DEFAULTS};
export function MicroAnimation23(props: Micro23Props) {
  const sampler = useMemo(() => createMicro23Sampler(props), [props.values, props.controls]);
  const frame = useCurrentFrame();
  return <Micro23Scene sample={sampler.sample(frame / 30)} controls={sampler.controls}/>;
}
