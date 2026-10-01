import type {ScoreStyle} from '../style';
import {TACTILE_LAYERS, composeTactile, duckTactile} from './composition';

export {TACTILE_LAYERS} from './composition';

/** LAM-2320 v2: `openai-pulse`'s form rebuilt from grains, early reflections and a struck, saturated sub. No piano. */
export const openaiTactile: ScoreStyle = {
  id: 'openai-tactile',
  title: 'Tactile pulse — struck sub, grains and room, after OpenAI',
  layers: TACTILE_LAYERS,
  keys: () => [],
  ducks: duckTactile,
  compose: composeTactile,
  design: () => {},
  // A close room carries every tail through the gaps (its low cut at 120 Hz gives the thumps space too); the hall is
  // for the blooms.
  space: {
    hall: {rt60: 2.2, predelay: .02, damping: 7000, size: 1, lowCut: 250},
    room: {rt60: .45, predelay: .004, damping: 9000, size: .5, lowCut: 120},
    delay: {time: .375, feedback: .22, damping: 5000},
    returns: [1.2, 1.6, .8],
  },
  eq: {highpass: 22, lowShelf: [70, -1.5], highShelf: [9000, 0]},
};
