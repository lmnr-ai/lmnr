import {useCurrentFrame,useVideoConfig} from 'remotion';
import {Micro07Sequence} from '../experiments/micro-07/Sequence';
import {sampleSnail} from '../experiments/micro-07/sample';

import type {SnailPalette} from '../experiments/micro-07/palette';

export const MicroAnimation07=({palette='vibrant'}:{palette?:SnailPalette})=>{
  const {fps}=useVideoConfig();
  return <Micro07Sequence {...sampleSnail(useCurrentFrame()/fps)} palette={palette}/>;
};
