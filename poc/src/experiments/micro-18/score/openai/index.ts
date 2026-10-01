import type {ScoreStyle} from '../style';
import {OPENAI_LAYERS, composeOpenai, duckOpenai} from './composition';

export {OPENAI_LAYERS} from './composition';

/** After OpenAI's "Get ready": gated sine sub, pentatonic soft keys, glass, dry ticks and suck-outs. No piano. */
export const openaiPulse: ScoreStyle = {
  id: 'openai-pulse',
  title: 'Pulse — gated sub and glass, after OpenAI',
  layers: OPENAI_LAYERS,
  // No piano samples are played; an empty bank skips nothing but documents that.
  keys: () => [],
  ducks: duckOpenai,
  compose: composeOpenai,
  // Everything lives in `compose`: one owner per layer.
  design: () => {},
  // The reference is close and nearly dry: a short room, a small bright hall for the glass, one dotted-eighth echo.
  space: {
    hall: {rt60: 1.6, predelay: .02, damping: 9000, size: .9, lowCut: 500},
    room: {rt60: .3, predelay: .003, damping: 9000, size: .35, lowCut: 300},
    delay: {time: .375, feedback: .28, damping: 6000},
    returns: [1.4, 1.2, 1],
  },
  eq: {highpass: 22, lowShelf: [60, 0], highShelf: [9000, 1]},
};
