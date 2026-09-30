import type {ScoreStyle} from '../style';
import {composeGlide, designGlide} from './composition';

/** TurboPuffer-inspired glide: synth swells under one story-driven filter, groove held for the payoff. */
export const glide: ScoreStyle = {
  id: 'glide',
  title: 'Glide (TurboPuffer reference)',
  // The voice ducking is baked from the narration itself when the bed is built (build-ultimate3-glide-bed.ts).
  ducks: () => {},
  compose: composeGlide,
  design: designGlide,
  space: {
    hall: {rt60: 3.6, predelay: .035, damping: 6000, size: 1.5, lowCut: 260},
    room: {rt60: .45, predelay: .005, damping: 5000, size: .5, lowCut: 120},
    delay: {time: 60 / 88.9 * .75, feedback: .32, damping: 3600},
    returns: [2.2, 1.4, 1],
  },
  eq: {highpass: 28, lowShelf: [90, 1], highShelf: [8000, 1.5]},
};
