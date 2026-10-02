import {designAcoustic, planNocturneDucks} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composeTintinnabuli} from './composition';

/** Scale and triad voices, after Pärt: piano bells and strings in a stone church; pizzicato answers the UI in F. */
export const tintinnabuli: ScoreStyle = {
  id: 'tintinnabuli',
  title: 'Tintinnabuli',
  strings: true,
  ducks: planNocturneDucks,
  compose: composeTintinnabuli,
  // F is two semitones over Nocturne's E♭; the composition's piano rings every other issue pop.
  design: designAcoustic(2, 'pizz', index => index % 2 === 0),
  space: {
    hall: {rt60: 4.6, predelay: .05, damping: 4800, size: 1.9, lowCut: 160},
    room: {rt60: .5, predelay: .005, damping: 7000, size: .5, lowCut: 250},
    delay: {time: .375, feedback: .2, damping: 3500},
    returns: [2.8, .8, .2],
  },
  eq: {highpass: 26, lowShelf: [90, -1], highShelf: [8000, 2]},
};
