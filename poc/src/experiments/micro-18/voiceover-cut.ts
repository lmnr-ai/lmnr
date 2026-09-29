import {MICRO_22_TIMING, MICRO_22_DEFAULTS} from '../micro-22/timeline';
import {upgradeStoredMicro22Timing, upgradeStoredMicro22Captions} from '../micro-22/persistence';
import importedSettings from '../../../handoff/voiceover-retime/retimed-settings.json';
import {normalizeSettings, FLOW_21_TIMING, type ClipTiming} from './settings';
import {VOICEOVER_PHRASES} from './voiceover-phrases';
import issues4Placements from '../../../handoff/voiceover-issues4/placements.json';

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
type Retime = Record<string, number | [at: number, duration: number]>;
const retime = <T extends Record<string, ClipTiming>>(timing: T, edits: Retime) => Object.fromEntries(Object.entries(timing).map(([key, clip]) => {
  const edit = edits[key];
  return [key, edit === undefined ? clip : typeof edit === 'number' ? {...clip, at: edit} : retimeClip(clip, ...edit)];
})) as T;
const shifted = (timing: Record<string, ClipTiming>, keys: string[], by: number): Retime =>
  Object.fromEntries(keys.map(key => [key, timing[key].at + by]));
// Legs zip on "Cheap LLMs fail", warnings pop on "crucial issues"; the budget
// arrives ~0.3s sooner (a slightly faster camera) for the tightened "but the costs".
const COST_RETIME: Retime = {cheapLegOneRight: 1.49, cheapLegTwoLeft: 1.97, cheapLegThreeRight: 2.45, thinkingDrop: 3.19, subtitleMissIssues: 3.19,
  cameraDownToBudget: [8.85, 1.15], ...shifted(original.cost.timing, ['purpleBudgetEntry', 'budgetAppear', 'budgetRun', 'smokeEnter',
    'budgetDepletion', 'smokeFade', 'smokeShrink', 'subtitleCost'], -.3)};
// Flow holds the benchmark until "while analyzing" and the engine from "Flow-1 powers Signals"
// through "our agent built to analyze"; Issues then enters on "traces at scale".
export const FLOW_HOLD = 2.692;
const FLOW_RETIME: Retime = {
  ...shifted(FLOW_21_TIMING, ['graphSpread', 'xAxisEntry', 'benchmarkHeadingExit', 'subtitleCost', 'analysisHeading', 'flowLabel'], 2.2),
  ...shifted(FLOW_21_TIMING, ['yAxisExit', 'xAxisExit', 'cameraToEngine', 'stringExit', 'subtitleSignals', 'moduleActivation',
    'engineSpinner', 'engineLines', 'coverDescent', 'coverTint', 'coverSpinner'], 2.4)};
// The bash lands and descends on "It finds deep issues" (0.8s in, was 1.6s); every later
// report beat keeps its global time, so the prelude is FLOW_HOLD shorter.
const ISSUES_RETIME: Retime = {blueBashEntry: [.1, .6], blueBashStop: .55, bashExpand: .7, bashDescent: [.8, 1.3],
  reportFocus: [1.8, .6], bashHighlight: [2, .4], bubble: 2.25, warningExit: 2.95, labels: [3.1, .6], labelReveal: 3.3,
  subtitleFlow: [0, .8], subtitleDetection: [.8, 1.45], subtitleReporting: [2.25, 1.05], subtitleLabels: [3.3, 2.158],
  ...shifted(MICRO_22_TIMING, ['explanation', 'explanationTyping', 'subtitleStructure', 'bubbleExit', 'analysisZoomOut', 'subtitleEveryTrace',
    'analysisTraceCollapse', 'analysisLocalGridFade', 'analysisCircleGrow', 'analysisCircleFade', 'analysisAgentScaleOut', 'analysisLayout'], -FLOW_HOLD)};
const unretimed = {...original,
  issues: {...original.issues, sourceVersion: 22 as const, timing22: MICRO_22_TIMING, controls22: MICRO_22_DEFAULTS, migration22: 1 as const},
  flow: {...original.flow, sourceVersion: 21 as const, timing21: FLOW_21_TIMING},
  allocations: {...original.allocations, ultimate2: original.allocations.ultimate2 + OPENING_RIPPLE},
  clouds: {...original.clouds!, timing: Object.fromEntries(Object.entries(original.clouds!.timing).map(([key, clip]) =>
    [key, retimeClip(clip, clip.at + OPENING_RIPPLE)])) as NonNullable<typeof original.clouds>['timing']},
  ultimate2: {...original.ultimate2, timing: openingTiming, streamBlocksRemoved: 10,
    controls: {...original.ultimate2.controls, streamerSpeed: OPENING_STREAM_SPEED}},
};
/** The editable-v5 defaults: storage still holding one of their generated fields upgrades it. */
const PREVIOUS_DEFAULTS = normalizeSettings({...unretimed, voiceover: {version: 1, phrases: {...takePhrases,
  n09: {at: issues4Placements[8].at, duration: issues4Placements[8].b - issues4Placements[8].a}}}});
export const VOICEOVER_DEFAULTS = normalizeSettings({...unretimed,
  issues: {...unretimed.issues, timing22: retime(MICRO_22_TIMING, ISSUES_RETIME)},
  flow: {...unretimed.flow, timing21: retime(FLOW_21_TIMING, FLOW_RETIME)},
  cost: {...original.cost, timing: retime(original.cost.timing, COST_RETIME)},
  pacing: {...original.pacing, flowTrimEnd: original.pacing.flowTrimEnd + FLOW_HOLD},
  allocations: {...unretimed.allocations, flow: original.allocations.flow + FLOW_HOLD, issues: original.allocations.issues - FLOW_HOLD},
  voiceover: {version: 1, phrases: takePhrases},
});
export function normalizeVoiceoverSettings(input: unknown) {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const settings = normalizeSettings({...raw, voiceover: raw.voiceover ?? VOICEOVER_DEFAULTS.voiceover});
  // Stamp imported historical cuts so a later storage load cannot upgrade them.
  return {...settings, issues: {...settings.issues, migration22: 1 as const}, flow: {...settings.flow, sourceVersion: settings.flow.sourceVersion ?? 13 as const}};
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const upgrade = <T extends object>(stored: T, previous: T, next: T): T => Object.fromEntries(Object.entries(stored).map(([key, value]) =>
  [key, equal(value, previous[key as keyof T]) ? next[key as keyof T] : value])) as T;
/** Storage only: replace recognized generated fields individually; JSON imports stay literal. */
export function migrateStoredVoiceoverOpening(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as typeof original;
  const timing = {...raw.ultimate2?.timing};
  for (const key of Object.keys(openingTiming) as (keyof typeof openingTiming)[]) {
    if (equal(timing[key], original.ultimate2.timing[key])) timing[key] = openingTiming[key];
  }
  const allocations = {...raw.allocations};
  if (allocations.ultimate2 === original.allocations.ultimate2) allocations.ultimate2 = VOICEOVER_DEFAULTS.allocations.ultimate2;
  // A source13 Flow or kept source20 Issues never had the voice retime.
  const retimed = raw.flow?.sourceVersion !== 13 && !(raw.issues?.migration22 === 1 && raw.issues.sourceVersion === 20);
  const pacing = raw.pacing && retimed ? upgrade(raw.pacing, PREVIOUS_DEFAULTS.pacing, VOICEOVER_DEFAULTS.pacing) : raw.pacing;
  if (retimed) for (const id of ['flow', 'issues'] as const)
    if (allocations[id] === PREVIOUS_DEFAULTS.allocations[id]) allocations[id] = VOICEOVER_DEFAULTS.allocations[id];
  const controls = {...raw.ultimate2?.controls};
  if (controls.streamerSpeed === original.ultimate2.controls.streamerSpeed) controls.streamerSpeed = OPENING_STREAM_SPEED;
  const clouds = raw.clouds ? {...raw.clouds, timing: {...raw.clouds.timing}} : undefined;
  if (clouds) for (const key of ['slideIn', 'partialRecede', 'recede'] as const) {
    if (equal(clouds.timing[key], original.clouds!.timing[key])) clouds.timing[key] = VOICEOVER_DEFAULTS.clouds!.timing[key];
  }
  const cost = raw.cost?.timing ? {...raw.cost, timing: upgrade(raw.cost.timing, PREVIOUS_DEFAULTS.cost.timing, VOICEOVER_DEFAULTS.cost.timing)} : raw.cost;
  const flow = raw.flow?.timing21 ? {...raw.flow, timing21: upgrade(raw.flow.timing21, PREVIOUS_DEFAULTS.flow.timing21!, VOICEOVER_DEFAULTS.flow.timing21!)} : raw.flow;
  const issues = raw.issues?.timing22 ? {...raw.issues, timing22: upgrade(raw.issues.timing22, PREVIOUS_DEFAULTS.issues.timing22!, VOICEOVER_DEFAULTS.issues.timing22!)} : raw.issues;
  const voiceover = raw.voiceover?.phrases ? {...raw.voiceover, phrases: upgrade(raw.voiceover.phrases, PREVIOUS_DEFAULTS.voiceover!.phrases, VOICEOVER_DEFAULTS.voiceover!.phrases)} : raw.voiceover;
  return {...raw, allocations, ...(pacing ? {pacing} : {}), ...(cost ? {cost} : {}), ...(flow ? {flow} : {}), ...(issues ? {issues} : {}), ...(voiceover ? {voiceover} : {}),
    ultimate2: {...raw.ultimate2, timing, controls, streamBlocksRemoved: raw.ultimate2?.streamBlocksRemoved ?? 10},
    ...(clouds ? {clouds} : {})};
}

/** Upgrade only unversioned v4 editor storage. Explicit imports and source13
 * presets remain literal; old timing stays available for legacy sound consumers.
 */
export function migrateStoredVoiceoverFlow21(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as typeof VOICEOVER_DEFAULTS;
  if (raw.flow?.sourceVersion !== undefined) return input;
  return {...raw, flow: {...raw.flow, sourceVersion: 21, timing21: VOICEOVER_DEFAULTS.flow.timing21}};
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
    timing22: raw.issues?.timing22 ?? VOICEOVER_DEFAULTS.issues.timing22, controls22: raw.issues?.controls22 ?? MICRO_22_DEFAULTS}};
}
