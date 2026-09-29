import type {ScoreStyle} from '../style';
import {composeTidepool} from './composition';
import {designTidepool, tidepoolDucks} from './design';

export const tidepool: ScoreStyle = {
  id: 'tidepool',
  title: 'Tidepool',
  ducks: tidepoolDucks,
  compose: composeTidepool,
  design: designTidepool,
  space: {
    hall: {rt60: 2.8, predelay: .035, damping: 6000, size: 1.25, lowCut: 300},
    room: {rt60: .45, predelay: .006, damping: 6500, size: .5, lowCut: 220},
    delay: {time: .46875, feedback: .34, damping: 3800},
    returns: [1.7, 1.3, 1],
  },
  eq: {highpass: 28, lowShelf: [90, .8], highShelf: [9000, 1.5]},
};
