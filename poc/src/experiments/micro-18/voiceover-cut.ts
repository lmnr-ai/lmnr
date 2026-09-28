import importedSettings from '../../../handoff/voiceover-retime/retimed-settings.json';
import {normalizeSettings, FLOW_21_TIMING, type ClipTiming} from './settings';
import {VOICEOVER_PHRASES} from './voiceover-phrases';
import {VOICEOVER_FADE} from './voiceover-schedule';

export const VOICEOVER_SETTINGS_ID = 'ultimate3-voiceover-retime-settings-v4';
export const VOICEOVER_SOUNDTRACK_URL = '/audio/voiceover/ultimate3-voiceover-v4.wav';
// Four real blocks (Write, icon, Bash, separator) fill 720px before the lifting blue.
// Keep the old run endpoint-to-elbow distance while stretching the run by 3.71s.
export const OPENING_RIPPLE = 13.5 - 9.79;
export const OPENING_STREAM_SPEED = (importedSettings.ultimate2.controls.streamerSpeed
  * importedSettings.ultimate2.timing.streamRun.duration + 720)
  / (importedSettings.ultimate2.timing.streamRun.duration + OPENING_RIPPLE);
const openingPhrases = [
  {at: .69, duration: 1.25}, {at: 3.44, duration: 2.7299999999999995},
  {at: 8.37, duration: 1.2399999999999984}, {at: 10.51, duration: 1.4100000000000001},
  {at: 13.5, duration: 6.1800000000000015},
];
const original = normalizeSettings({...importedSettings, voiceover: {version: 1, phrases: Object.fromEntries(
  VOICEOVER_PHRASES.map(p => [p.id, p.placed]))}});
const retimeClip = (clip: ClipTiming, at: number, duration = clip.duration): ClipTiming => ({
  ...clip, at, duration, ...(clip.transition?.type === 'easing' ? {transition: {...clip.transition, duration}} : {}),
});
const openingTiming = Object.fromEntries(Object.entries(original.ultimate2.timing).map(([key, clip]) => {
  const extend = key === 'streamRun' || key === 'subtitleTrace';
  return [key, retimeClip(clip, clip.at + (clip.at >= original.ultimate2.timing.continueStraight.at ? OPENING_RIPPLE : 0),
    clip.duration + (extend ? OPENING_RIPPLE : 0))];
})) as typeof original.ultimate2.timing;
const placedDefault = (p: typeof VOICEOVER_PHRASES[number]) => ({at: p.placed.at + OPENING_RIPPLE, duration: p.placed.duration});
const phrase = (id: string) => VOICEOVER_PHRASES.find(p => p.id === id)!;
// "traces at scale" was one breath: vo16 butts onto vo17's first sample and overlaps it by one fade, so the linear
// fade-out/fade-in of identical source samples sums to unity and the join is the take itself.
const JOINS: Record<string, ClipTiming> = {vo16: {at: placedDefault(phrase('vo17')).at - phrase('vo16').placed.duration, duration: phrase('vo16').placed.duration + VOICEOVER_FADE}};
export const VOICEOVER_DEFAULTS = normalizeSettings({...original,
  flow: {...original.flow, sourceVersion: 21, timing21: FLOW_21_TIMING},
  allocations: {...original.allocations, ultimate2: original.allocations.ultimate2 + OPENING_RIPPLE},
  clouds: {...original.clouds!, timing: Object.fromEntries(Object.entries(original.clouds!.timing).map(([key, clip]) =>
    [key, retimeClip(clip, clip.at + OPENING_RIPPLE)])) as NonNullable<typeof original.clouds>['timing']},
  ultimate2: {...original.ultimate2, timing: openingTiming, streamBlocksRemoved: 10,
    controls: {...original.ultimate2.controls, streamerSpeed: OPENING_STREAM_SPEED}},
  voiceover: {version: 1, phrases: Object.fromEntries(VOICEOVER_PHRASES.map((p, index) => [p.id,
    index < 5 ? openingPhrases[index] : JOINS[p.id] ?? placedDefault(p)]))},
});
export function normalizeVoiceoverSettings(input: unknown) {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const settings = normalizeSettings({...raw, voiceover: raw.voiceover ?? VOICEOVER_DEFAULTS.voiceover});
  // Stamp imported historical cuts so a later storage load cannot upgrade them.
  return {...settings, flow: {...settings.flow, sourceVersion: settings.flow.sourceVersion ?? 13 as const}};
}

/** Storage only: replace recognized generated fields individually; JSON imports stay literal. */
export function migrateStoredVoiceoverOpening(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as typeof original;
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const timing = {...raw.ultimate2?.timing};
  for (const key of Object.keys(openingTiming) as (keyof typeof openingTiming)[]) {
    if (equal(timing[key], original.ultimate2.timing[key])) timing[key] = openingTiming[key];
  }
  const phrases = {...raw.voiceover?.phrases};
  for (const [index, phrase] of VOICEOVER_PHRASES.entries()) {
    const previous = original.voiceover!.phrases[phrase.id];
    if (equal(phrases[phrase.id], previous) || (index >= 5 && equal(phrases[phrase.id], placedDefault(phrase)))) phrases[phrase.id] = VOICEOVER_DEFAULTS.voiceover!.phrases[phrase.id];
  }
  const allocations = {...raw.allocations};
  if (allocations.ultimate2 === original.allocations.ultimate2) allocations.ultimate2 = VOICEOVER_DEFAULTS.allocations.ultimate2;
  const controls = {...raw.ultimate2?.controls};
  if (controls.streamerSpeed === original.ultimate2.controls.streamerSpeed) controls.streamerSpeed = OPENING_STREAM_SPEED;
  const clouds = raw.clouds ? {...raw.clouds, timing: {...raw.clouds.timing}} : undefined;
  if (clouds) for (const key of ['slideIn', 'partialRecede', 'recede'] as const) {
    if (equal(clouds.timing[key], original.clouds!.timing[key])) clouds.timing[key] = VOICEOVER_DEFAULTS.clouds!.timing[key];
  }
  return {...raw, allocations, ultimate2: {...raw.ultimate2, timing, controls,
    streamBlocksRemoved: raw.ultimate2?.streamBlocksRemoved ?? 10},
    ...(raw.voiceover ? {voiceover: {...raw.voiceover, phrases}} : {}), ...(clouds ? {clouds} : {})};
}

/** Upgrade only unversioned v4 editor storage. Explicit imports and source13
 * presets remain literal; old timing stays available for legacy sound consumers.
 */
export function migrateStoredVoiceoverFlow21(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as typeof VOICEOVER_DEFAULTS;
  if (raw.flow?.sourceVersion !== undefined) return input;
  return {...raw, flow: {...raw.flow, sourceVersion: 21, timing21: FLOW_21_TIMING}};
}

/** Separate authoring state: opening the returned cut never rewrites the original presets. */
export function readVoiceoverSettings(storage: Pick<Storage, 'getItem'>) {
  try {
    const stored = storage.getItem(VOICEOVER_SETTINGS_ID);
    return normalizeVoiceoverSettings(stored ? migrateStoredVoiceoverFlow21(migrateStoredVoiceoverOpening(JSON.parse(stored))) : VOICEOVER_DEFAULTS);
  } catch {
    return normalizeVoiceoverSettings(VOICEOVER_DEFAULTS);
  }
}
