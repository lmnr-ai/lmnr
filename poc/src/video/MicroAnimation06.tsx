import {useCurrentFrame,useVideoConfig} from 'remotion';
import {Micro06Sequence} from '../experiments/micro-06/Sequence';
import {sampleSnail} from '../experiments/micro-06/sample';

import type {WaveEnvelope} from '../experiments/micro-06/wave';
import type {SnailPalette} from '../experiments/micro-06/palette';

export const MicroAnimation06=({palette='vibrant',waveEnvelope}:{palette?:SnailPalette;waveEnvelope?:WaveEnvelope})=>{
  const {fps}=useVideoConfig();
  return <Micro06Sequence {...sampleSnail(useCurrentFrame()/fps)} palette={palette} waveEnvelope={waveEnvelope}/>;
};
