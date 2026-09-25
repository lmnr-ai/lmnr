import type {ScoreStyle} from '../style';
import {electricPiano} from '../voices';
import {composeNocturne} from './composition';
import {designAcoustic, designNocturne, planNocturneDucks} from './design';

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

/** Nocturne with no electronics: the piano answers every UI moment and plays the budget draining. */
export const nocturneAcoustic: ScoreStyle = {
  ...nocturne,
  id: 'nocturne-acoustic',
  title: 'Nocturne (acoustic)',
  compose: (mix, cues) => composeNocturne(mix, cues, {acoustic: true}),
  // The composition's piano takes every third issue pop.
  design: designAcoustic(0, 'piano', index => index % 3 === 0),
};

/** Nocturne as a piano and violin duet: sampled strings, the solo violin sings the theme and plays the budget draining. */
export const nocturneDuet: ScoreStyle = {
  ...nocturne,
  id: 'nocturne-duet',
  title: 'Nocturne (piano & violin)',
  strings: true,
  compose: (mix, cues) => composeNocturne(mix, cues, {acoustic: true, violin: true}),
  design: designAcoustic(0, 'piano', index => index % 3 === 0),
};

/** Nocturne all digital: the same writing on an FM electric piano, synth strings and a sub for the timpani, under the electronic foley. */
export const nocturneDigital: ScoreStyle = {
  ...nocturne,
  id: 'nocturne-digital',
  title: 'Nocturne (digital)',
  keys: electricPiano,
  compose: (mix, cues) => composeNocturne(mix, cues, {digital: true}),
};
