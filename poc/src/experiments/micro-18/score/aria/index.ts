import {designInKey, planNocturneDucks} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composeAria} from './composition';

export const aria: ScoreStyle = {
  id: 'aria',
  title: 'Aria',
  strings: true,
  ducks: planNocturneDucks,
  compose: composeAria,
  // Nocturne's foley a semitone down, so every beep sits in D.
  design: designInKey(-1),
  space: {
    hall: {rt60: 3, predelay: .04, damping: 6000, size: 1.6, lowCut: 170},
    delay: {time: .375, feedback: .28, damping: 4000},
    returns: [2.5, 1.4, .9],
  },
  eq: {highpass: 28, lowShelf: [90, -1], highShelf: [8000, 2]},
};
