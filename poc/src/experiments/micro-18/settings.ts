import {DEFAULTS as MICRO17_CONTROLS, type Controls as Micro17Controls} from '../micro-17/geometry';
import {DEFAULT_TIMING as MICRO17_TIMING, normalizeTiming as normalize17Timing, resolveClips as resolveMicro17Clips, type Timing as Micro17Timing} from '../micro-17/timeline';
import {DEFAULTS as MICRO16_CONTROLS, DEFAULT_TIMING as MICRO16_TIMING, normalizeControls as normalize16Controls, normalizeTiming as normalize16Timing, type Controls as Micro16Controls, type Timing as Micro16Timing} from '../micro-16/timeline';
import {MICRO_15_DEFAULTS, MICRO_15_TIMING, normalizeMicro15Controls, normalizeMicro15Timing, type Micro15Controls, type Micro15Timing} from '../micro-15/timeline';
import {INTRODUCING_FLOW_1_TIMELINE, FLOW_CLIP_KEYS, type FlowClipKey} from '../introducing-flow-1/timeline';
import type {TransitionConfig} from 'dialkit';
import {STREAM_RUN_TRIM_SECONDS} from '../micro-17/stream-trim';

export const CHAPTER_IDS = ['ultimate2', 'cost', 'flow', 'issues', 'conclusion'] as const;
export type ChapterId = typeof CHAPTER_IDS[number];
export type ClipTiming = {at: number; duration: number; transition?: TransitionConfig};
export type FlowEditableKey = Exclude<FlowClipKey, 'cloudReveal'>;
export type FlowTiming = Record<FlowEditableKey, ClipTiming>;
export type FlowControls = {cloudYOffset: number; blueDotScale: number; numberRowStagger: number; coverMotion: 'top'|'right'|'split'; mutedGray: string};
export type Ultimate3Settings = {
  version: 2;
  allocations: Record<ChapterId, number>;
  pacing: {ultimate2HandoffHold: number; costTrimEnd: number; flowTrimEnd: number};
  ultimate2: {timing: Micro17Timing; controls: Micro17Controls};
  cost: {timing: Micro16Timing; controls: Micro16Controls};
  flow: {entrySlide: ClipTiming; timing: FlowTiming; controls: FlowControls};
  issues: {leadIn: ClipTiming; timing: Micro15Timing; controls: Micro15Controls};
  conclusion: {placeholder: ClipTiming; logo: ClipTiming};
};
const smooth = [.45, 0, .55, 1] as [number, number, number, number];
const flowTiming = Object.fromEntries(FLOW_CLIP_KEYS.filter(k => k !== 'cloudReveal').map(key => {
  const clip = INTRODUCING_FLOW_1_TIMELINE[key];
  return [key, {at: clip.at, duration: clip.duration, transition: clip.transition}];
})) as FlowTiming;
const SHIFTED_MICRO_17_KEYS = new Set([
  'continueStraight', 'upwardTurn', 'cameraBacktrack', 'redThinkingLift', 'readLift', 'thinkingLift',
  'highlight', 'warningEnter', 'warningFocus', 'finalZoom', 'streamCollapse', 'loaderFade', 'dotDim',
  'smallGridFade', 'cloudEnter', 'cloudHold', 'subtitleFailure', 'subtitleWhy', 'subtitleInsights', 'subtitleIfOnly',
]);
const PREVIOUS_MICRO_17_TIMING = normalize17Timing(Object.fromEntries(Object.entries(MICRO17_TIMING).map(([key, value]) => {
  const restoreDuration = key === 'streamRun' || key === 'subtitleTrace';
  const duration = value.duration + (restoreDuration ? STREAM_RUN_TRIM_SECONDS : 0);
  return [key, {
    ...value,
    at: value.at + (SHIFTED_MICRO_17_KEYS.has(key) ? STREAM_RUN_TRIM_SECONDS : 0),
    duration,
    transition: value.transition ? {...value.transition, ...(restoreDuration ? {duration} : {})} : undefined,
  }];
})));
const PREVIOUS_MICRO_15_TIMING = {
  appearance: {at: 0, duration: .93}, travelStart: {at: .94, duration: .35}, coverAppearance: {at: 1.31, duration: .38},
  triangleScaleOut: {at: 1.1, duration: .36}, triangleScaleIn: {at: 1.24, duration: .68},
  agentWindowEnter: {at: 2.83, duration: .47}, promptTyping: {at: 2.87, duration: .44}, issueTyping: {at: 3.23, duration: .27},
  issuePadding: {at: 3.21, duration: .35}, issueBackground: {at: 3.24, duration: .2}, issueWarningIn: {at: 3.4, duration: .3},
  messageSend: {at: 3.65, duration: .18}, cliCommandTyping: {at: 3.78, duration: .26}, sqlQueryTyping: {at: 3.99, duration: .23},
  sqlPredicateTyping: {at: 4.18, duration: .27}, queryWarningIn: {at: 4.16, duration: .2}, agentWindowExit: {at: 5.34, duration: .38},
  subtitleIssues: {at: 0, duration: .94}, subtitlePatterns: {at: .94, duration: 1.89}, subtitleReady: {at: 2.83, duration: 3.17},
};

export const ULTIMATE_3_DEFAULTS: Ultimate3Settings = {
  version: 2,
  allocations: {ultimate2: MICRO17_TIMING.cloudEnter.at + MICRO17_TIMING.cloudEnter.duration + .5, cost: 15, flow: 13, issues: 7.5, conclusion: 4},
  pacing: {ultimate2HandoffHold: .5, costTrimEnd: 15, flowTrimEnd: 11.8},
  ultimate2: {timing: MICRO17_TIMING, controls: MICRO17_CONTROLS},
  cost: {timing: MICRO16_TIMING, controls: MICRO16_CONTROLS},
  flow: {entrySlide: {at: 0, duration: 1.2, transition: {type: 'easing', duration: 1.2, ease: smooth}}, timing: flowTiming,
    controls: {cloudYOffset: 37, blueDotScale: 1.2, numberRowStagger: .05, coverMotion: 'split', mutedGray: '#474747'}},
  issues: {leadIn: {at: 0, duration: .5, transition: {type: 'easing', duration: .5, ease: [0,0,1,1]}}, timing: MICRO_15_TIMING, controls: MICRO_15_DEFAULTS},
  conclusion: {placeholder: {at: 0, duration: 2}, logo: {at: 2, duration: 2}},
};

/**
 * Upgrades only the generated 1s + 1s conclusion retained in editor storage.
 * JSON imports deliberately bypass this helper so authored 1s + 1s timings
 * remain valid and normalization stays authoritative rather than migratory.
 */
export function migrateStoredSettings(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Partial<Ultimate3Settings>;
  const conclusion = raw.conclusion;
  const isOldGeneratedConclusion = conclusion?.placeholder?.at === 0
    && conclusion.placeholder.duration === 1
    && conclusion.placeholder.transition === undefined
    && conclusion.logo?.at === 1
    && conclusion.logo.duration === 1
    && conclusion.logo.transition === undefined;
  if (!isOldGeneratedConclusion) return input;
  return {
    ...raw,
    allocations: raw.allocations ? {...raw.allocations} : raw.allocations,
    conclusion: {
      placeholder: {...conclusion.placeholder, duration: 2},
      logo: {...conclusion.logo, at: 2, duration: 2},
    },
  };
}

/** Retimes only the prior generated Ultimate 2 defaults; custom authored timing remains authoritative. */
export function migrateStoredUltimate2Timeline(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Partial<Ultimate3Settings>;
  if (JSON.stringify(raw.ultimate2?.timing) !== JSON.stringify(PREVIOUS_MICRO_17_TIMING)) return input;
  return {
    ...raw,
    allocations: raw.allocations ? {...raw.allocations,
      ultimate2: raw.allocations.ultimate2 === 18.7 ? ULTIMATE_3_DEFAULTS.allocations.ultimate2 : raw.allocations.ultimate2} : raw.allocations,
    ultimate2: {...raw.ultimate2, timing: MICRO17_TIMING},
  };
}

/** Retimes only the prior generated Issues defaults; custom authored timing remains authoritative. */
export function migrateStoredIssueTimeline(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Partial<Ultimate3Settings>;
  if (JSON.stringify(raw.issues?.timing) !== JSON.stringify(PREVIOUS_MICRO_15_TIMING)) return input;
  return {
    ...raw,
    allocations: raw.allocations ? {...raw.allocations, issues: raw.allocations.issues === 6.5 ? 7.5 : raw.allocations.issues} : raw.allocations,
    issues: {
      ...raw.issues,
      timing: MICRO_15_TIMING,
      controls: raw.issues?.controls ? {...raw.issues.controls,
        timelineDuration: raw.issues.controls.timelineDuration === 6 ? 7 : raw.issues.controls.timelineDuration} : raw.issues?.controls,
    },
  };
}

/** Replaces only Ultimate 3's previously generated single top cover on storage load. */
export function migrateStoredFlowCover(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const raw = input as Partial<Ultimate3Settings>;
  if (raw.flow?.controls?.coverMotion !== 'top') return input;
  return {
    ...raw,
    flow: {
      ...raw.flow,
      controls: {...raw.flow.controls, coverMotion: 'split'},
    },
  };
}
const finite = (v: unknown, fallback: number, min = 0, max = 1e4) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const clip = (value: unknown, fallback: ClipTiming): ClipTiming => {
  const v = value && typeof value === 'object' ? value as Partial<ClipTiming> : {};
  return {at: finite(v.at, fallback.at), duration: finite(v.duration, fallback.duration), transition: v.transition ?? fallback.transition};
};
const recordControls = <T extends Record<string, number>>(value: unknown, defaults: T): T => {
  const v: Record<string, unknown> = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, finite(v[key], fallback as number, -1e4)])) as T;
};
export function flowEndpoint(settings: Ultimate3Settings) {
  // This is an intentional local tail trim, not a duration floor. Authored
  // tracks keep their native seconds and are clipped at the selected endpoint.
  return settings.pacing.flowTrimEnd;
}
export function ultimate2Endpoint(settings: Ultimate3Settings) {
  // Ultimate 3 deliberately trims Animation17 when its cloud entry completes,
  // then holds that pose. Later source-only tracks (including subtitles) must
  // not silently resurrect a tail that this composition explicitly clipped.
  const cloud = resolveMicro17Clips(settings.ultimate2.timing).find(clip => clip.key === 'cloudEnter')!;
  const authored = settings.ultimate2.timing.cloudEnter;
  const cloudEnd = authored.at + (authored.duration === 0 ? 0 : cloud.duration);
  return cloudEnd + settings.pacing.ultimate2HandoffHold;
}
export function costEndpoint(settings: Ultimate3Settings) {
  // Like Flow, Cost freezes at the explicit clipped native endpoint. Extending
  // a chapter allocation adds a hold; it never resurrects the trimmed tail.
  return settings.pacing.costTrimEnd;
}
export function issueEndpoint(settings: Ultimate3Settings) {
  const t = settings.issues.timing;
  return Math.max(settings.issues.controls.timelineDuration, ...Object.values(t).map(c => c.at + c.duration),
    t.appearance.at + t.appearance.duration + settings.issues.controls.warningAppearanceDuration,
    t.travelStart.at + t.travelStart.duration + settings.issues.controls.travelDuration);
}
export function chapterFloors(settings: Ultimate3Settings): Record<ChapterId, number> {
  return {ultimate2: ultimate2Endpoint(settings), cost: costEndpoint(settings),
    flow: settings.flow.entrySlide.at + settings.flow.entrySlide.duration + flowEndpoint(settings),
    issues: settings.issues.leadIn.at + settings.issues.leadIn.duration + issueEndpoint(settings),
    conclusion: Math.max(settings.conclusion.placeholder.at + settings.conclusion.placeholder.duration,
      settings.conclusion.logo.at + settings.conclusion.logo.duration)};
}
export function normalizeSettings(input: unknown): Ultimate3Settings {
  const raw = input && typeof input === 'object' ? input as Partial<Ultimate3Settings> : {};
  const u2 = raw.ultimate2 ?? ULTIMATE_3_DEFAULTS.ultimate2;
  const cost = raw.cost ?? ULTIMATE_3_DEFAULTS.cost;
  const flow = raw.flow ?? ULTIMATE_3_DEFAULTS.flow;
  const issues = raw.issues ?? ULTIMATE_3_DEFAULTS.issues;
  const conclusion = raw.conclusion ?? ULTIMATE_3_DEFAULTS.conclusion;
  const pacingRaw = (raw as Partial<Ultimate3Settings>).pacing;
  const normalized: Ultimate3Settings = {
    version: 2,
    allocations: {...ULTIMATE_3_DEFAULTS.allocations},
    pacing: {
      ultimate2HandoffHold: finite(pacingRaw?.ultimate2HandoffHold, .5, 0, 30),
      costTrimEnd: finite(pacingRaw?.costTrimEnd, 15, 0, 60),
      flowTrimEnd: finite(pacingRaw?.flowTrimEnd, 11.8, 0, 60),
    },
    ultimate2: {timing: normalize17Timing(u2.timing), controls: recordControls(u2.controls, MICRO17_CONTROLS)},
    cost: {timing: normalize16Timing(cost.timing), controls: normalize16Controls(cost.controls)},
    flow: {entrySlide: clip(flow.entrySlide, ULTIMATE_3_DEFAULTS.flow.entrySlide),
      timing: Object.fromEntries(Object.keys(flowTiming).map(key => [key, clip(flow.timing?.[key as FlowEditableKey], flowTiming[key as FlowEditableKey])])) as FlowTiming,
      controls: {cloudYOffset: finite(flow.controls?.cloudYOffset, 37, -500, 500), blueDotScale: finite(flow.controls?.blueDotScale, 1.2, .25, 5),
        numberRowStagger: finite(flow.controls?.numberRowStagger, .05, 0, .25), coverMotion: ['top','right','split'].includes(flow.controls?.coverMotion ?? '') ? flow.controls!.coverMotion : 'split',
        mutedGray: typeof flow.controls?.mutedGray === 'string' ? flow.controls.mutedGray : '#474747'}},
    issues: {leadIn: clip(issues.leadIn, ULTIMATE_3_DEFAULTS.issues.leadIn),
      timing: normalizeMicro15Timing((issues.timing ?? MICRO_15_TIMING) as Micro15Timing), controls: normalizeMicro15Controls((issues.controls ?? MICRO_15_DEFAULTS) as Micro15Controls)},
    conclusion: {placeholder: clip(conclusion.placeholder, ULTIMATE_3_DEFAULTS.conclusion.placeholder), logo: clip(conclusion.logo, ULTIMATE_3_DEFAULTS.conclusion.logo)},
  };
  // Conclusion stages are a contiguous two-card sequence: resizing/moving the
  // placeholder ripples the logo cut rather than leaving a stale visual boundary.
  normalized.conclusion.logo.at = normalized.conclusion.placeholder.at + normalized.conclusion.placeholder.duration;
  const floors = chapterFloors(normalized);
  const obsoleteGenerated: Partial<Record<ChapterId, number>> = {ultimate2: 22, cost: 17, flow: 14.5};
  normalized.allocations = Object.fromEntries(CHAPTER_IDS.map(id => {
    const saved = raw.allocations?.[id];
    // These three exact values were automatically seeded by the superseded
    // 62-second build. Migrate them even if that interrupted build already
    // wrote version 2; all other allocations remain user-authored.
    const migrated = saved === obsoleteGenerated[id] ? ULTIMATE_3_DEFAULTS.allocations[id] : saved;
    return [id, Math.max(floors[id], finite(migrated, ULTIMATE_3_DEFAULTS.allocations[id]))];
  })) as Record<ChapterId, number>;
  return normalized;
}
export const SETTINGS_STORAGE_ID = 'micro-animation-18-settings-v1';
export const CONCLUSION_STORAGE_MIGRATION_ID = 'micro-animation-18-conclusion-duration-v1';
export const FLOW_COVER_STORAGE_MIGRATION_ID = 'micro-animation-18-flow-cover-split-v1';
export const ISSUE_TIMING_STORAGE_MIGRATION_ID = 'micro-animation-18-issues-timing-v1';
export const ULTIMATE_2_TIMING_STORAGE_MIGRATION_ID = 'micro-animation-18-ultimate2-stream-trim-v1';
