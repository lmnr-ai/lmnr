import legacyPlacements from '../../../handoff/voiceover-retime/placements.json';
import placements from '../../../handoff/voiceover-2026-10-02/placements.json';

/** The approved A/subtle take, each phrase's speech onset on the 10-04 take's (editable-v7) onset, n03 onward 1.25s sooner with the shorter trace run, then n02 onward up to 4.95s sooner for a tighter cadence and n03 onward up to 1.48s more. The October 2 retake keeps every onset but n12 (0.16s sooner for its longer "Matching…") and n13 (0.3s later). New IDs versus the September 27 vo* phrases, so their stored edits never move these. */
export const VOICEOVER_PHRASES = placements.map((phrase, index) => {
  const id = `n${String(index + 1).padStart(2, '0')}`;
  return {id, text: phrase.text, a: phrase.a, b: phrase.b, file: `${id}.wav`, defaultAt: phrase.at, placed: {at: phrase.at, duration: phrase.b - phrase.a}};
});
export const VOICEOVER_SOURCE_ROOT = '/audio/voiceover/editable-v12/';
// Scored to the voice-retimed Issue Clusters 4 cut (scripts/build-ultimate3-issues4-vo.mjs); editable-v11/v10/v9/v8/v7/v6/v5/v4 keep the earlier beds and takes.
export const VOICEOVER_BED_URL = `${VOICEOVER_SOURCE_ROOT}bed.wav`;
/** Auditionable soundtracks under the same phrases. Arabesque is the approved default; Glide is the
 * TurboPuffer-reference candidate (scripts/build-ultimate3-glide-bed.ts), frozen to the pricing-timing cut. */
export const VOICEOVER_BEDS = {
  arabesque: {label: 'Arabesque (approved)', url: VOICEOVER_BED_URL},
  // Ducked against the October 2 phrases on handoff/voiceover-2026-10-02/default-settings.json. The other Glide beds stay
  // in editable-v11-* with the take they were keyed to.
  'glide-minimal-linger': {label: 'Glide · minimal (linger)', url: '/audio/voiceover/editable-v12-glide-minimal-linger/bed.wav'},
  // LAM-2317 Cursor-reference scores (scripts/build-ultimate3-cursor-bed.ts), ducked against the October 2 phrases on the
  // same settings. editable-v11-cursor{,-v2,-v3} keep the beds keyed to the earlier take.
  'cursor-v3': {label: 'Cursor · v3 (LAM-2317)', url: '/audio/voiceover/editable-v12-cursor-v3/bed.wav'},
  'cursor-v4': {label: 'Cursor · v4, builds to the logo (LAM-2317)', url: '/audio/voiceover/editable-v12-cursor-v4/bed.wav'},
  // v5 is keyed to the laminar.sh ending (handoff/cursor-sound-design/v5/settings.json), 75.5 s; on the 73.7 s cut it runs long.
  'cursor-v5': {label: 'Cursor · v5, laminar.sh ending (LAM-2317)', url: '/audio/voiceover/editable-v12-cursor-v5/bed.wav'},
} as const;
export type VoiceoverBedId = keyof typeof VOICEOVER_BEDS;

// "traces" runs straight into "at scale"; the v4 trim stopped mid-hiss. This source keeps the whole "s" (tapered) for when vo16 and vo17 are pulled apart.
const RETRIMS: Partial<Record<string, {b: number; file: string}>> = {vo16: {b: 44.55, file: 'vo16-tail.wav'}};
/** The September 27 take's immutable editable-v4 trims; only historical cuts and their tests still read these. */
export const VOICEOVER_PHRASES_V4 = legacyPlacements.map((phrase, index) => {
  const id = `vo${String(index + 1).padStart(2, '0')}`;
  return {id, text: phrase.text, a: phrase.a, b: phrase.b, file: `${id}.wav`, defaultAt: phrase.at, placed: {at: phrase.at, duration: phrase.b - phrase.a}, ...RETRIMS[id]};
});
