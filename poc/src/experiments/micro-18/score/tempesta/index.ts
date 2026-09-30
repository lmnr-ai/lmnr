import type {ScoreStyle} from '../style';
import {composeTempesta} from './composition';
import {designTempesta, tempestaDucks} from './design';

export const tempesta: ScoreStyle = {
  id: 'tempesta',
  title: 'Tempesta',
  strings: true,
  ducks: tempestaDucks,
  compose: composeTempesta,
  design: designTempesta,
  space: {
    hall: {rt60: 2.4, predelay: .025, damping: 6500, size: 1, lowCut: 220},
    room: {rt60: .5, predelay: .005, damping: 7500, size: .5, lowCut: 160},
    delay: {time: 60 / 144 * .75, feedback: .15, damping: 3500},
    returns: [1.1, .9, 0],
  },
  eq: {highpass: 30, lowShelf: [90, 1.5], highShelf: [7500, 1.5]},
};
