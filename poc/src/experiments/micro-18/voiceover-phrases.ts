import placements from '../../../handoff/voiceover-retime/placements.json';

// "traces" runs straight into "at scale"; the v4 trim stopped mid-hiss. This source keeps the whole "s" (tapered) for when vo16 and vo17 are pulled apart.
const RETRIMS: Partial<Record<string, {b: number; file: string}>> = {vo16: {b: 44.55, file: 'vo16-tail.wav'}};
/** Stable IDs name immutable 48kHz source trims; authoring changes only position/end trim. `placed` is the historical cut. */
export const VOICEOVER_PHRASES = placements.map((phrase, index) => {
  const id = `vo${String(index + 1).padStart(2, '0')}`;
  return {id, text: phrase.text, a: phrase.a, b: phrase.b, file: `${id}.wav`, defaultAt: phrase.at, placed: {at: phrase.at, duration: phrase.b - phrase.a}, ...RETRIMS[id]};
});
export const VOICEOVER_SOURCE_ROOT = '/audio/voiceover/editable-v4/';
// Scored to the Animation 21 cut (scripts/build-ultimate3-flow21-bed.mjs); the v4 `bed.wav` is kept for provenance.
export const VOICEOVER_BED_URL = `${VOICEOVER_SOURCE_ROOT}flow21-bed.wav`;
