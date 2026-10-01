import legacyPlacements from '../../../handoff/voiceover-retime/placements.json';
import placements from '../../../handoff/voiceover-brisk-cadence/placements.json';

/** The approved A/subtle take, each phrase's speech onset on the 10-04 take's (editable-v7) onset, n03 onward 1.25s sooner with the shorter trace run, then n02 onward up to 4.95s sooner for a tighter cadence and n03 onward up to 1.48s more. New IDs versus the September 27 vo* phrases, so their stored edits never move these. */
export const VOICEOVER_PHRASES = placements.map((phrase, index) => {
  const id = `n${String(index + 1).padStart(2, '0')}`;
  return {id, text: phrase.text, a: phrase.a, b: phrase.b, file: `${id}.wav`, defaultAt: phrase.at, placed: {at: phrase.at, duration: phrase.b - phrase.a}};
});
export const VOICEOVER_SOURCE_ROOT = '/audio/voiceover/editable-v11/';
/**
 * Voice-free music/FX beds under the same editable-v11 phrases. `tactile` is the LAM-2320 v2 struck-sub score and
 * `openai` its v1 gated-sub score (both scripts/build-ultimate3-openai-bed.mjs); `piano` keeps the Arabesque bed scored
 * to the Issue Clusters 4 cut (scripts/build-ultimate3-issues4-vo.mjs) for comparison. editable-v10/v9/v8/v7/v6/v5/v4
 * keep the earlier beds and takes.
 */
export const VOICEOVER_BEDS = {
  tactile: '/audio/voiceover/editable-v11-openai-tactile/',
  openai: '/audio/voiceover/editable-v11-openai/',
  piano: VOICEOVER_SOURCE_ROOT,
} as const;
export type VoiceoverBed = keyof typeof VOICEOVER_BEDS;
export const VOICEOVER_BED: VoiceoverBed = 'tactile';
export const isVoiceoverBed = (value: unknown): value is VoiceoverBed => typeof value === 'string' && Object.hasOwn(VOICEOVER_BEDS, value);
export const voiceoverBedUrl = (bed: VoiceoverBed = VOICEOVER_BED) => `${VOICEOVER_BEDS[bed]}bed.wav`;
export const VOICEOVER_BED_URL = voiceoverBedUrl();

// "traces" runs straight into "at scale"; the v4 trim stopped mid-hiss. This source keeps the whole "s" (tapered) for when vo16 and vo17 are pulled apart.
const RETRIMS: Partial<Record<string, {b: number; file: string}>> = {vo16: {b: 44.55, file: 'vo16-tail.wav'}};
/** The September 27 take's immutable editable-v4 trims; only historical cuts and their tests still read these. */
export const VOICEOVER_PHRASES_V4 = legacyPlacements.map((phrase, index) => {
  const id = `vo${String(index + 1).padStart(2, '0')}`;
  return {id, text: phrase.text, a: phrase.a, b: phrase.b, file: `${id}.wav`, defaultAt: phrase.at, placed: {at: phrase.at, duration: phrase.b - phrase.a}, ...RETRIMS[id]};
});
