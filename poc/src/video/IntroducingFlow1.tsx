import {useCurrentFrame, useVideoConfig} from 'remotion';
import {IntroducingFlow1Scene} from '../experiments/introducing-flow-1/Scene';
import {sampleIntroducingFlow1} from '../experiments/introducing-flow-1/sample';

type IntroducingFlow1Props = {
  cloudYOffset?: number;
  blueDotScale?: number;
  coverMotion?: 'top' | 'right' | 'split';
  mutedGray?: string;
};

export const IntroducingFlow1 = (props: IntroducingFlow1Props) => {
  const {fps} = useVideoConfig();
  return <IntroducingFlow1Scene playback={sampleIntroducingFlow1(useCurrentFrame() / fps)} {...props}/>;
};
