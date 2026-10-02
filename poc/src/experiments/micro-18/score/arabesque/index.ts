import {designAcoustic, designInKey, planNocturneDucks} from '../nocturne/design';
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

/** Arabesque with no electronics: piano alone, answering every UI moment too. */
export const arabesqueAcoustic: ScoreStyle = {
  ...arabesque,
  id: 'arabesque-acoustic',
  title: 'Arabesque (acoustic)',
  compose: (mix, cues) => composeArabesque(mix, cues, {acoustic: true}),
  // The composition's piano takes every second issue pop.
  design: designAcoustic(1, 'piano', index => index % 2 === 0),
};

/** Arabesque Acoustic with a steady, chill bed before Flow-1: one mood, no dropouts, events as soft piano touches. */
export const arabesqueAcousticChill: ScoreStyle = {
  ...arabesqueAcoustic,
  id: 'arabesque-acoustic-chill',
  title: 'Arabesque (acoustic, chill prelude)',
  // Only the agent-window shut still ducks; the warning ducks read as stops in the steady bed.
  ducks: (mix, cues) => planNocturneDucks(mix, {...cues, ultimate2: {...cues.ultimate2, warning: -10}, cost: {...cues.cost, bashWarning: -10}}),
  compose: (mix, cues) => composeArabesque(mix, cues, {acoustic: true, chill: true}),
};
