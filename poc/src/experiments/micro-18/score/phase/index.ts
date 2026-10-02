import {designAcoustic, planNocturneDucks} from '../nocturne/design';
import type {ScoreStyle} from '../style';
import {composePhase} from './composition';

/** Two pianos phasing one pattern, after Reich, over pulsing strings; pizzicato answers the UI in G. */
export const phase: ScoreStyle = {
  id: 'phase',
  title: 'Phase',
  strings: true,
  ducks: planNocturneDucks,
  compose: composePhase,
  // G is four semitones over Nocturne's E♭; the composition's piano rings every other issue pop.
  design: designAcoustic(4, 'pizz', index => index % 2 === 0),
  // A drier studio than the Nocturne hall, so the interlocking sixteenths stay legible.
  space: {
    hall: {rt60: 1.9, predelay: .02, damping: 7000, size: 1.1, lowCut: 200},
    room: {rt60: .5, predelay: .004, damping: 8000, size: .5, lowCut: 220},
    delay: {time: .375, feedback: .2, damping: 4000},
    returns: [2.2, 2.2, .4],
  },
  eq: {highpass: 28, lowShelf: [90, -1.5], highShelf: [8000, 2.5]},
};
