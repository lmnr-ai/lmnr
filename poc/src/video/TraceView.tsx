import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { TraceScene } from '../scene/TraceScene';
import type { DialValues } from '../anim/timeline';
import tuned from '../../tuned.json';

/**
 * The Remotion driver. The only difference from the tuning app is where `t`
 * comes from: a frame number here, DialKit's transport there.
 */
export const TraceView = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill>
      <TraceScene t={frame / fps} values={tuned as DialValues} />
    </AbsoluteFill>
  );
};
