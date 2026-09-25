import {designInKey, planNocturneDucks} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composeArabesque} from './composition';

export const arabesque: ScoreStyle = {
  id: 'arabesque',
  title: 'Arabesque',
  ducks: planNocturneDucks,
  compose: composeArabesque,
  // Nocturne's foley a semitone up, so every beep sits in E.
  design: designInKey(1),
  space: {
    hall: {rt60: 3.4, predelay: .03, damping: 5600, size: 1.6, lowCut: 200},
    // Triplet-quarter echoes, so the "data" repeats sit inside the arabesque's pulse.
    delay: {time: 1 / 3, feedback: .36, damping: 3600},
    returns: [2.5, 1.3, 1.1],
  },
  eq: {highpass: 26, lowShelf: [80, -1], highShelf: [8000, 2.5]},
};
