import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Micro09Scene} from '../experiments/micro-09/Scene';
import {sampleMicro09} from '../experiments/micro-09/sample';
import type {SparkleControls} from '../experiments/micro-09/sparkle';

export type MicroAnimation09Props = SparkleControls & {seed: number; cloudYOffset: number; signalsYOffset: number};

export const MicroAnimation09 = ({seed, cloudYOffset, signalsYOffset, clockFrequency, triangleProbability, stateChangeProbability, colorChangeProbability, isolationWeight}: MicroAnimation09Props) => {
  const {fps} = useVideoConfig();
  return <Micro09Scene
    {...sampleMicro09(useCurrentFrame() / fps)}
    seed={seed}
    cloudYOffset={cloudYOffset}
    signalsYOffset={signalsYOffset}
    sparkle={{clockFrequency, triangleProbability, stateChangeProbability, colorChangeProbability, isolationWeight}}
  />;
};
