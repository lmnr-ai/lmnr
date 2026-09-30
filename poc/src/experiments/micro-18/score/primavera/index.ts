import type {ScoreStyle} from '../style';
import {composePrimavera} from './composition';
import {designPrimavera, primaveraDucks} from './design';

export const primavera: ScoreStyle = {
  id: 'primavera',
  title: 'Primavera',
  strings: true,
  ducks: primaveraDucks,
  compose: composePrimavera,
  design: designPrimavera,
  space: {
    hall: {rt60: 2.6, predelay: .03, damping: 6000, size: 1, lowCut: 220},
    room: {rt60: .5, predelay: .005, damping: 7000, size: .5, lowCut: 160},
    delay: {time: 60 / 120 * .75, feedback: .15, damping: 3500},
    returns: [1.15, .8, 0],
  },
  // A gentle top: the soloist sits back instead of cutting through.
  eq: {highpass: 30, lowShelf: [90, 1], highShelf: [7000, -1]},
};
