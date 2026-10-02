import {useCurrentFrame, useVideoConfig} from 'remotion';
import {DEFAULTS, type Controls} from '../experiments/micro-12/geometry';
import {sampleMicro12} from '../experiments/micro-12/sample';
import {Micro12Scene} from '../experiments/micro-12/Scene';
export const MICRO_12_VIDEO_DEFAULTS = DEFAULTS;
export const MicroAnimation12 = (controls: Controls) => {
  const {fps} = useVideoConfig();
  return <Micro12Scene playback={sampleMicro12(useCurrentFrame() / fps)} controls={controls}/>;
};
