import {designAcoustic, planNocturneDucks} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composeLofi} from './composition';
import {rhodes} from './instruments';

/** Ducks for a steady bed: only the agent-window shut still dips; the warning ducks read as stops. */
export const steadyDucks: ScoreStyle['ducks'] = (mix, cues) => planNocturneDucks(mix, {...cues, ultimate2: {...cues.ultimate2, warning: -10}, cost: {...cues.cost, bashWarning: -10}});

export const lofiRhodes: ScoreStyle = {
  id: 'lofi-rhodes',
  title: 'Lo-fi Rhodes',
  keys: rhodes,
  ducks: steadyDucks,
  compose: composeLofi,
  // Nocturne's foley two semitones up, played on the Rhodes; the composition plays the issue pops.
  design: designAcoustic(2, 'piano', () => true),
  space: {
    hall: {rt60: 1.8, predelay: .02, damping: 4200, size: 1, lowCut: 240},
    room: {rt60: .5, predelay: .005, damping: 5200, size: .5, lowCut: 200},
    delay: {time: .375, feedback: .32, damping: 2600},
    returns: [1.8, 1.8, 1],
  },
  eq: {highpass: 30, lowShelf: [90, 1], highShelf: [7000, -3]},
};
