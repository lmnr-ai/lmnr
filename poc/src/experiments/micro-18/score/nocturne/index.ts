import type {ScoreStyle} from '../style';
import {composeNocturne} from './composition';
import {designNocturne, planNocturneDucks} from './design';

export const nocturne: ScoreStyle = {
  id: 'nocturne',
  title: 'Nocturne',
  ducks: planNocturneDucks,
  compose: composeNocturne,
  design: designNocturne,
  space: {
    hall: {rt60: 2.8, predelay: .035, damping: 6500, size: 1.5, lowCut: 180},
    delay: {time: .375, feedback: .3, damping: 4200},
    returns: [2.6, 1.5, .9],
  },
  eq: {highpass: 28, lowShelf: [90, -1.5], highShelf: [8000, 3]},
};
