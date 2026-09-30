import type {ScoreStyle} from '../style';
import {composeWindup} from './composition';
import {designWindup, windupDucks} from './design';

export const windup: ScoreStyle = {
  id: 'windup',
  title: 'Windup',
  ducks: windupDucks,
  compose: composeWindup,
  design: designWindup,
  space: {
    hall: {rt60: 1.9, predelay: .025, damping: 5500, size: 1, lowCut: 280},
    room: {rt60: .5, predelay: .004, damping: 6000, size: .45, lowCut: 200},
    delay: {time: 60 / 112 * .75, feedback: .3, damping: 3500},
    returns: [1.4, 1.6, .9],
  },
  eq: {highpass: 32, lowShelf: [90, .6], highShelf: [8500, 1]},
};
