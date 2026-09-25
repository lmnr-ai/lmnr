import {useCurrentFrame, useVideoConfig} from 'remotion';
import {MicroScene} from '../experiments/micro-01/Scene';
import {createSampler} from '../experiments/micro-01/timeline';

const sampler = createSampler();

export const MicroAnimation01 = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const time = frame / fps;

  return (
    <MicroScene
      time={time}
      comets={sampler.at(time)}
      whiteTrailOpacity={0.07}
      dashGap={0}
      strokeWidth={20}
      maskWidth={108}
      maskOpacity={0.5}
      perspective={1200}
      rotateX={0}
      rotateY={0}
      rotateZ={-7}
      shearX={9}
      shearY={0}
      scale={1}
      renderMode
    />
  );
};
