import {electricPiano} from '../voices';
import {designAcoustic} from '../nocturne/design';
import {steadyDucks} from '../lofi';
import {beatOf, gridOf, type ScoreStyle} from '../style';
import {composeCityPop} from './composition';

export const cityPop: ScoreStyle = {
  id: 'city-pop',
  title: 'City pop, light',
  keys: electricPiano,
  ducks: steadyDucks,
  compose: composeCityPop,
  // Nocturne's foley in D on the electric piano, following the score up to E at Flow-1.
  design: designAcoustic(-1, 'piano', () => true, cues => ({shift: time => time >= gridOf(cues, beatOf(cues, cues.flow.reveal)) - .05 ? 2 : 0})),
  space: {
    hall: {rt60: 2.2, predelay: .025, damping: 6500, size: 1.2, lowCut: 250},
    delay: {time: .375, feedback: .3, damping: 4200},
    returns: [2, 1.6, 1],
  },
  eq: {highpass: 30, lowShelf: [80, -1], highShelf: [8000, 2]},
};
