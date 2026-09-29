import type {ScoreStyle} from '../style';
import {composeOverdrive} from './composition';
import {designOverdrive, overdriveDucks} from './design';

export const overdrive: ScoreStyle = {
  id: 'overdrive',
  title: 'Overdrive',
  strings: true,
  ducks: overdriveDucks,
  compose: composeOverdrive,
  design: designOverdrive,
  space: {
    hall: {rt60: 3.2, predelay: .03, damping: 6000, size: 1, lowCut: 300},
    room: {rt60: .45, predelay: .004, damping: 7000, size: .45, lowCut: 200},
    delay: {time: 60 / 128 * .75, feedback: .3, damping: 4000},
    returns: [1, 1.2, .7],
  },
  eq: {highpass: 28, lowShelf: [80, 2.5], highShelf: [8000, 2.5]},
};
