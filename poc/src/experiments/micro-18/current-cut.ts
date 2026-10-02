import profile from '../../../handoff/glide-linger-current/settings.json';
import {normalizeSettings, type ClipTiming, type Ultimate3Settings} from './settings';
import {withFlowComparison} from './flow-comparison';
import {COST_ZIP_KEY, settingsFromCostZipTimeline} from './cost-zip-authoring';
import {BRISK_CADENCE_PHRASES, normalizeVoiceoverSettings, readVoiceoverSettings, VOICEOVER_DEFAULTS, VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {VOICEOVER_PHRASES} from './voiceover-phrases';

export const CURRENT_SOUNDTRACK = 'cursor-v5' as const;
export const CURRENT_MIX_ID = 'ultimate3-voiceover-sound-v4';
export const CURRENT_CUT_BACKUP = 'ultimate3-before-current-cut-v1';
const MIX_MIGRATION = 'ultimate3-current-mix-v1';
const MIX_BACKUP = 'ultimate3-before-current-mix-v1';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-8;

/** Imports are literal, including an intentionally selected old spinner or ending. */
export const normalizeCurrentVoiceoverSettings = (input: unknown) => ({
  ...normalizeVoiceoverSettings(input), currentCutVersion: 1 as const, costLeadInVersion: 1 as const, costTimingRecoveryVersion: 1 as const,
  voiceoverTakeVersion: 2 as const,
});
export const COST_LEAD_IN_BACKUP = 'ultimate3-before-cost-lead-in-v1';
/** Storage-only translation: keep native action clocks at their previous global beats.
 * Manually changed boundaries/insufficient holds are stamped but left literal. */
export function migrateCostLeadIn(settings: Ultimate3Settings): Ultimate3Settings {
  if (settings.costLeadInVersion === 1) return settings;
  const stamped = {...settings, costLeadInVersion: 1 as const};
  if (settings.flow.sourceVersion !== 21 || settings.issues.sourceVersion !== 22
    || settings.allocations.ultimate2 !== profile.allocations.ultimate2
    || settings.allocations.cost !== profile.allocations.cost
    || settings.pacing.ultimate2HandoffHold < 1.5) return stamped;
  return normalizeSettings({...stamped,
    allocations: {...settings.allocations, ultimate2: settings.allocations.ultimate2 - 1.5, cost: settings.allocations.cost + 1.5},
    pacing: {...settings.pacing, ultimate2HandoffHold: settings.pacing.ultimate2HandoffHold - 1.5, costTrimEnd: settings.pacing.costTrimEnd + 1.5},
    cost: {...settings.cost, timing: Object.fromEntries(Object.entries(settings.cost.timing).map(([key, clip]) => [key, {...clip, at: clip.at + 1.5}]))},
  });
}
/** Frozen pre-tuning baseline for the boundary migration and its regression fixtures. */
export const COST_LEAD_IN_DEFAULTS = {...migrateCostLeadIn({...normalizeVoiceoverSettings(profile), currentCutVersion: 1}), costTimingRecoveryVersion: 1 as const};
// Approved Main timeline: zip 18.76–20.96 globally. Persist the three native
// chapter-local legs, so Main, Cost detail and export share the same timing.
const tunedZipDefaults = settingsFromCostZipTimeline({[COST_ZIP_KEY]: {at: 18.76, duration: 2.1999999999999997}}, COST_LEAD_IN_DEFAULTS);
/** The current picture as it was on editable-v11's slots. */
export const V11_CURRENT_DEFAULTS = normalizeSettings({...tunedZipDefaults,
  cost: {...tunedZipDefaults.cost, timing: {...tunedZipDefaults.cost.timing,
    cloudSweep: {at: .05, duration: 2.41, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing', duration: 2.41, ease: [.45, 0, .55, 1]}},
  }},
});
// The October 2 take's longer "Matching… intelligence," starts 0.16s sooner (as the five peers land) and still
// pushes n13 0.3s, so the comparison follows n13; the grid return waits for n13's end and still arrives at the engine.
const COMPARISON_DELAY = .3, RETURN_DELAY = .25;
const v11Comparison = V11_CURRENT_DEFAULTS.flow.comparison || undefined;
const delayed = (clip: ClipTiming, delay: number, shrink = 0): ClipTiming => ({...clip, at: clip.at + delay, duration: clip.duration - shrink,
  ...(clip.transition?.type === 'easing' ? {transition: {...clip.transition, duration: clip.duration - shrink}} : {})});
// The logo holds 3 s past "With Laminar", then cuts to the laminar.sh card, which holds 4.53 s to a 75.5 s end.
const withUrlCard = (settings: Ultimate3Settings): Ultimate3Settings => normalizeSettings({...settings,
  allocations: {...settings.allocations, conclusion: 12.57},
  conclusion: {...settings.conclusion, logo: {...settings.conclusion.logo, duration: 3.99}, url: {at: 8.04, duration: 4.53}}});
export const CURRENT_VOICEOVER_DEFAULTS = withUrlCard({...V11_CURRENT_DEFAULTS, voiceoverTakeVersion: 2,
  voiceover: VOICEOVER_DEFAULTS.voiceover,
  flow: {...V11_CURRENT_DEFAULTS.flow, ...(v11Comparison ? {comparison: {...v11Comparison, timing: Object.fromEntries(Object.entries(v11Comparison.timing).map(([key, clip]) =>
    [key, key === 'comparison_returnToGrid' ? delayed(clip, RETURN_DELAY, RETURN_DELAY) : delayed(clip, COMPARISON_DELAY)])) as typeof v11Comparison.timing}} : {})},
});
export const VOICEOVER_TAKE_BACKUP = 'ultimate3-before-voiceover-take-v2';
/** Storage only: move editable-v11's generated phrase slots and comparison clips to the October 2 take's.
 * A slot matches even after normalizing capped it to the new trim; edited slots and clips stay literal. */
export function migrateVoiceoverTake(settings: Ultimate3Settings): Ultimate3Settings {
  if (settings.voiceoverTakeVersion === 2) return settings;
  const stamped = {...settings, voiceoverTakeVersion: 2 as const};
  const phrases = settings.voiceover && Object.fromEntries(Object.entries(settings.voiceover.phrases).map(([id, clip]) => {
    const old = BRISK_CADENCE_PHRASES[id], phrase = VOICEOVER_PHRASES.find(p => p.id === id);
    const generated = old && phrase && close(clip.at, old.at)
      && (close(clip.duration, old.duration) || close(clip.duration, Math.min(old.duration, phrase.b - phrase.a)));
    return [id, generated ? CURRENT_VOICEOVER_DEFAULTS.voiceover!.phrases[id] : clip];
  }));
  const comparison = settings.flow.comparison, target = CURRENT_VOICEOVER_DEFAULTS.flow.comparison;
  const timing = comparison && v11Comparison && target && Object.fromEntries(Object.entries(comparison.timing).map(([key, clip]) =>
    [key, same(clip, v11Comparison.timing[key as keyof typeof v11Comparison.timing]) ? target.timing[key as keyof typeof target.timing] : clip])) as typeof v11Comparison.timing;
  return normalizeSettings({...stamped, ...(phrases ? {voiceover: {...settings.voiceover!, phrases}} : {}),
    ...(comparison && timing ? {flow: {...settings.flow, comparison: {...comparison, timing}}} : {})});
}
export const COST_TIMING_RECOVERY_BACKUP = 'ultimate3-before-cost-timing-recovery-v1';

/** Recover only the observed interrupted migration, using this browser's own
 * pre-transfer settings. Never translate already shifted clips or later edits. */
function recoverCostTiming(settings: Ultimate3Settings, storage: Pick<Storage, 'getItem'>): Ultimate3Settings {
  if (settings.costTimingRecoveryVersion === 1) return settings;
  const checked = {...settings, costTimingRecoveryVersion: 1 as const};
  let raw: Ultimate3Settings;
  try {raw = JSON.parse(storage.getItem(COST_LEAD_IN_BACKUP) ?? 'null');} catch {return checked;}
  const keys = Object.keys(settings.cost.timing) as (keyof typeof settings.cost.timing)[];
  if (!raw?.cost?.timing || !raw.allocations || !raw.pacing
    || keys.some(key => !raw.cost.timing[key]) || settings.costLeadInVersion !== 1
    || settings.flow.sourceVersion !== 21 || settings.issues.sourceVersion !== 22
    || !close(raw.allocations.ultimate2, profile.allocations.ultimate2)
    || !close(raw.allocations.cost, profile.allocations.cost)
    || !close(settings.allocations.ultimate2, raw.allocations.ultimate2 - 1.5)
    || !close(settings.allocations.cost, raw.allocations.cost + 1.5)
    || raw.pacing.ultimate2HandoffHold < 1.5) return checked;
  const before = normalizeSettings(raw);
  const unchanged = (key: typeof keys[number]) => {
    const a: ClipTiming = settings.cost.timing[key], b: ClipTiming = before.cost.timing[key];
    return close(a.at, b.at) && close(a.duration, b.duration) && same(a.transition, b.transition)
      && (a.from?.progress ?? 0) === (b.from?.progress ?? 0)
      && (a.to?.progress ?? 1) === (b.to?.progress ?? 1);
  };
  const oldHold = close(settings.pacing.ultimate2HandoffHold, before.pacing.ultimate2HandoffHold);
  const actionKeys = keys.filter(key => key !== 'cloudSweep');
  // An old handoff hold proves the transfer is incomplete. Without that proof,
  // require the entire action group to be stale, not one deliberately moved bar.
  if (!oldHold && !actionKeys.every(unchanged)) return checked;
  const timing = {...settings.cost.timing};
  for (const key of keys) if (unchanged(key)) timing[key] = {...timing[key], at: timing[key].at + 1.5};
  return normalizeSettings({...checked, cost: {...settings.cost, timing}, pacing: {...settings.pacing,
    ultimate2HandoffHold: oldHold ? before.pacing.ultimate2HandoffHold - 1.5 : settings.pacing.ultimate2HandoffHold,
    costTrimEnd: close(settings.pacing.costTrimEnd, before.pacing.costTrimEnd) ? before.pacing.costTrimEnd + 1.5 : settings.pacing.costTrimEnd,
  }});
}

/** Storage only: a stored cut still on the generated pre-url ending gains the url card; edited endings stay literal. */
export function migrateUrlCard(settings: Ultimate3Settings): Ultimate3Settings {
  const generated = !settings.conclusion.url && same(settings.conclusion, V11_CURRENT_DEFAULTS.conclusion)
    && close(settings.allocations.conclusion, V11_CURRENT_DEFAULTS.allocations.conclusion);
  return generated ? withUrlCard(settings) : settings;
}

export function readCurrentVoiceoverSettings(storage: Pick<Storage, 'getItem'>) {
  return migrateUrlCard(migrateVoiceoverTake(recoverCostTiming(readCurrentSettingsBeforeRecovery(storage), storage)));
}

/** Only the active edition opts into this profile. Historical defaults stay frozen. */
function readCurrentSettingsBeforeRecovery(storage: Pick<Storage, 'getItem'>) {
  let raw: unknown;
  try {raw = JSON.parse(storage.getItem(VOICEOVER_SETTINGS_ID) ?? 'null');} catch {return CURRENT_VOICEOVER_DEFAULTS;}
  if (!raw || typeof raw !== 'object') return CURRENT_VOICEOVER_DEFAULTS;
  // Versioned current settings bypass historical opening/Cost generated-field
  // upgrades, but retain the existing missing-comparison storage migration.
  const settings = (raw as Ultimate3Settings).currentCutVersion === 1
    ? normalizeVoiceoverSettings(withFlowComparison(normalizeSettings(raw))) : readVoiceoverSettings(storage);
  if (settings.currentCutVersion === 1 || settings.flow.sourceVersion !== 21 || settings.issues.sourceVersion !== 22) return migrateCostLeadIn(settings);
  // Match the whole generated control group, not arbitrary author-edited widths.
  const cost = same(settings.cost.controls, VOICEOVER_DEFAULTS.cost.controls)
    ? {...settings.cost, controls: {...settings.cost.controls, cheapSpinnerStrokeWidth: 3}} : settings.cost;
  const oldEnding = settings.allocations.conclusion === VOICEOVER_DEFAULTS.allocations.conclusion
    && same(settings.conclusion, VOICEOVER_DEFAULTS.conclusion);
  return migrateCostLeadIn({...settings, currentCutVersion: 1 as const, paperTexture: settings.paperTexture ?? false, cost,
    ...(oldEnding ? {conclusion: CURRENT_VOICEOVER_DEFAULTS.conclusion,
      allocations: {...settings.allocations, conclusion: CURRENT_VOICEOVER_DEFAULTS.allocations.conclusion}} : {}),
  });
}

/** Run before DialKit registers the mix panel; preserve presets, base values and gain. */
export function loadCurrentVoiceoverSettings(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const settings = readCurrentVoiceoverSettings(storage);
  try {
    const before = storage.getItem(VOICEOVER_SETTINGS_ID);
    if (before && !storage.getItem(VOICEOVER_TAKE_BACKUP)) storage.setItem(VOICEOVER_TAKE_BACKUP, before);
    if (before && !storage.getItem(COST_TIMING_RECOVERY_BACKUP)) storage.setItem(COST_TIMING_RECOVERY_BACKUP, before);
    if (before && !storage.getItem(COST_LEAD_IN_BACKUP)) storage.setItem(COST_LEAD_IN_BACKUP, before);
    if (before && !storage.getItem(CURRENT_CUT_BACKUP)) storage.setItem(CURRENT_CUT_BACKUP, before);
    storage.setItem(VOICEOVER_SETTINGS_ID, JSON.stringify(settings));
    if (!storage.getItem(MIX_MIGRATION)) {
      const key = `dialkit:${CURRENT_MIX_ID}`;
      const previous = storage.getItem(key);
      if (previous) {
        const mix = JSON.parse(previous);
        // Only the old generated selection, never an active preset or other bed.
        if (mix?.activePresetId == null && mix?.values?.soundtrack === 'arabesque' && mix?.baseValues?.soundtrack === 'arabesque') {
          if (!storage.getItem(MIX_BACKUP)) storage.setItem(MIX_BACKUP, previous);
          storage.setItem(key, JSON.stringify({...mix, values: {...mix.values, soundtrack: CURRENT_SOUNDTRACK}}));
        }
      }
      storage.setItem(MIX_MIGRATION, '1');
    }
  } catch { /* Read-only/blocked storage still gets usable in-memory picture defaults. */ }
  return settings;
}
