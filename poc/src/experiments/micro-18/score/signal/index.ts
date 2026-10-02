import type {ScoreStyle} from '../style';
import {composeSignal} from './composition';
import {designSignal, planSignalDucks} from './design';

export const signal: ScoreStyle = {
  id: 'signal',
  title: 'Signal',
  ducks: planSignalDucks,
  compose: composeSignal,
  design: designSignal,
  space: {
    hall: {rt60: 2.4, predelay: .02, damping: 5600, size: 1.3, lowCut: 220},
    delay: {time: .375, feedback: .42, damping: 3400},
    returns: [2.2, 1.6, 1.5],
  },
  eq: {highpass: 24, lowShelf: [70, -1], highShelf: [7500, 2.5]},
};
