import {designAcoustic, designInKey, planNocturneDucks} from '../nocturne/design';
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

/** Aria with no electronics: pizzicato answers every UI moment, and the solo violin plays the budget draining. */
export const ariaAcoustic: ScoreStyle = {
  ...aria,
  id: 'aria-acoustic',
  title: 'Aria (acoustic)',
  compose: (mix, cues) => composeAria(mix, cues, {acoustic: true}),
  // The composition's pizzicato takes every second issue pop.
  design: designAcoustic(-1, 'pizz', index => index % 2 === 0),
};
