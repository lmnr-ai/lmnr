import placements from '../../../handoff/voiceover-retime/placements.json';

/** Stable IDs name immutable 48kHz source trims; authoring changes only position/end trim. */
export const VOICEOVER_PHRASES = placements.map((phrase, index) => ({
  id: `vo${String(index + 1).padStart(2, '0')}`, text: phrase.text,
  a: phrase.a, b: phrase.b, defaultAt: phrase.at,
}));
export const VOICEOVER_SOURCE_ROOT = '/audio/voiceover/editable-v4/';
// Scored to the Animation 21 cut (scripts/build-ultimate3-flow21-bed.mjs); the v4 `bed.wav` is kept for provenance.
export const VOICEOVER_BED_URL = `${VOICEOVER_SOURCE_ROOT}flow21-bed.wav`;
