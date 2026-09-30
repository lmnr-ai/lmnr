import type {ScoreStyle} from '../style';
import {composePrimavera} from './composition';
import {designPrimavera, primaveraDucks} from './design';
import {composePrimaveraAmbient, designPrimaveraAmbient} from './ambient';
import {composePrimaveraDawn, designPrimaveraDawn} from './dawn';

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

/** The same spring harmony held as an ambient bed, so the voiceover stays the centre (round 5). */
export const primaveraAmbient: ScoreStyle = {
  id: 'primavera-ambient',
  title: 'Primavera ambient',
  strings: true,
  ducks: primaveraDucks,
  compose: composePrimaveraAmbient,
  design: designPrimaveraAmbient,
  space: {
    hall: {rt60: 3.4, predelay: .04, damping: 5500, size: 1, lowCut: 200},
    room: {rt60: .5, predelay: .005, damping: 7000, size: .5, lowCut: 160},
    delay: {time: 60 / 120 * .75, feedback: .15, damping: 3500},
    returns: [1.25, .6, 0],
  },
  eq: {highpass: 34, lowShelf: [90, 0], highShelf: [7000, -1.5]},
};

/** Primavera ambient's tense first half, then an A major resolution that carries the announcement (round 6). */
export const primaveraDawn: ScoreStyle = {
  id: 'primavera-dawn',
  title: 'Primavera dawn',
  strings: true,
  ducks: primaveraDucks,
  compose: composePrimaveraDawn,
  design: designPrimaveraDawn,
  space: primaveraAmbient.space,
  eq: {highpass: 34, lowShelf: [90, .5], highShelf: [7000, -1.5]},
};
