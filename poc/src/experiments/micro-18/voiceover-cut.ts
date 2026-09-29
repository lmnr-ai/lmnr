import {MICRO_22_TIMING, MICRO_22_DEFAULTS} from '../micro-22/timeline';
import {upgradeStoredMicro22Timing, upgradeStoredMicro22Captions} from '../micro-22/persistence';
import importedSettings from '../../../handoff/voiceover-retime/retimed-settings.json';
import {normalizeSettings, FLOW_21_TIMING, type ClipTiming} from './settings';
import {VOICEOVER_PHRASES} from './voiceover-phrases';

export const VOICEOVER_SETTINGS_ID = 'ultimate3-voiceover-retime-settings-v4';
export const VOICEOVER_SOUNDTRACK_URL = '/audio/voiceover/ultimate3-voiceover-v4.wav';
// Four real blocks (Write, icon, Bash, separator) fill 720px before the lifting blue.
// Keep the old run endpoint-to-elbow distance while stretching the run by 3.71s.
export const OPENING_RIPPLE = 13.5 - 9.79;
export const OPENING_STREAM_SPEED = (importedSettings.ultimate2.controls.streamerSpeed
  * importedSettings.ultimate2.timing.streamRun.duration + 720)
  / (importedSettings.ultimate2.timing.streamRun.duration + OPENING_RIPPLE);
// Every phrase of the September 29 take sits at its authored slot on the Issue Clusters 4 cut.
const takePhrases = Object.fromEntries(VOICEOVER_PHRASES.map(p => [p.id, p.placed]));
const original = normalizeSettings({...importedSettings, voiceover: {version: 1, phrases: takePhrases}});
const retimeClip = (clip: ClipTiming, at: number, duration = clip.duration): ClipTiming => ({
  ...clip, at, duration, ...(clip.transition?.type === 'easing' ? {transition: {...clip.transition, duration}} : {}),
});
const openingTiming = Object.fromEntries(Object.entries(original.ultimate2.timing).map(([key, clip]) => {
  const extend = key === 'streamRun' || key === 'subtitleTrace';
  return [key, retimeClip(clip, clip.at + (clip.at >= original.ultimate2.timing.continueStraight.at ? OPENING_RIPPLE : 0),
    clip.duration + (extend ? OPENING_RIPPLE : 0))];
})) as typeof original.ultimate2.timing;
export const VOICEOVER_DEFAULTS = normalizeSettings({...original,
  issues: {...original.issues, sourceVersion: 22, timing22: MICRO_22_TIMING, controls22: MICRO_22_DEFAULTS, migration22: 1},
  flow: {...original.flow, sourceVersion: 21, timing21: FLOW_21_TIMING},
  allocations: {...original.allocations, ultimate2: original.allocations.ultimate2 + OPENING_RIPPLE},
  clouds: {...original.clouds!, timing: Object.fromEntries(Object.entries(original.clouds!.timing).map(([key, clip]) =>
    [key, retimeClip(clip, clip.at + OPENING_RIPPLE)])) as NonNullable<typeof original.clouds>['timing']},
  ultimate2: {...original.ultimate2, timing: openingTiming, streamBlocksRemoved: 10,
    controls: {...original.ultimate2.controls, streamerSpeed: OPENING_STREAM_SPEED}},
  voiceover: {version: 1, phrases: takePhrases},
});
export function normalizeVoiceoverSettings(input: unknown) {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const settings = normalizeSettings({...raw, voiceover: raw.voiceover ?? VOICEOVER_DEFAULTS.voiceover});
  // Stamp imported historical cuts so a later storage load cannot upgrade them.
  return {...settings, issues: {...settings.issues, migration22: 1 as const}, flow: {...settings.flow, sourceVersion: settings.flow.sourceVersion ?? 13 as const}};
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
    ...(clouds ? {clouds} : {})};
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
    return normalizeVoiceoverSettings(stored ? migrateStoredVoiceoverMotion22(migrateStoredVoiceoverIssues22(migrateStoredVoiceoverFlow21(migrateStoredVoiceoverOpening(JSON.parse(stored))))) : VOICEOVER_DEFAULTS);
  } catch {
    return normalizeVoiceoverSettings(VOICEOVER_DEFAULTS);
  }
}

/** Correct only the first source22 release's generated shallow descent on load. */
export function migrateStoredVoiceoverMotion22(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as typeof VOICEOVER_DEFAULTS;
  if (raw.issues?.sourceVersion !== 22) return input;
  const timing22 = upgradeStoredMicro22Captions(upgradeStoredMicro22Timing(raw.issues.timing22));
  return timing22 === raw.issues.timing22 ? input : {...raw, issues: {...raw.issues, timing22}};
}

/** Load-only marker also stamps intentional imports (including explicit source20).
 * Pre-upgrade current-v4 storage switches even when it explicitly persisted20;
 * all old source20 bars/controls remain recoverable and round-trip untouched. */
export function migrateStoredVoiceoverIssues22(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as typeof VOICEOVER_DEFAULTS;
  if (raw.issues?.migration22 === 1) return input;
  return {...raw, issues: {...raw.issues, sourceVersion: 22, migration22: 1,
    timing22: raw.issues?.timing22 ?? MICRO_22_TIMING, controls22: raw.issues?.controls22 ?? MICRO_22_DEFAULTS}};
}
