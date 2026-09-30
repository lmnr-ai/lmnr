import type {ScoreStyle} from '../style';
import {composeLumen} from './composition';
import {designLumen, lumenDucks} from './design';

export const lumen: ScoreStyle = {
  id: 'lumen',
  title: 'Lumen',
  ducks: lumenDucks,
  compose: composeLumen,
  design: designLumen,
  space: {
    hall: {rt60: 3.2, predelay: .04, damping: 7500, size: 1.35, lowCut: 320},
    room: {rt60: .35, predelay: .005, damping: 7500, size: .45, lowCut: 250},
    delay: {time: .375, feedback: .4, damping: 4500},
    returns: [1.8, 1.1, 1.2],
  },
  eq: {highpass: 30, lowShelf: [85, .6], highShelf: [10000, 2]},
};
