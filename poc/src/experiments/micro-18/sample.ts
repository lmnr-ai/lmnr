import {sampleIssueOutro} from '../micro-20/outro';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {sampleMicro17, type Playback as Micro17Playback} from '../micro-17/sample';
import {sampleMicro16, type Micro16State} from '../micro-16/sample';
import {sampleMicro20} from '../micro-20/sample';
import {sampleMicro15} from '../micro-15/sample';
import {evaluateClip, unit} from '../micro-20/timeline';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE, type FlowClipKey} from '../introducing-flow-1/timeline';
import type {FlowPlayback} from '../introducing-flow-1/sample';
import {CHAPTER_IDS, chapterFloors, issueEntryEnd, issueEndpoint, issuePostludeOffset, issuePreludeEnd, costEndpoint, flowEndpoint, normalizeSettings, ultimate2Endpoint, type ChapterId, type ClipTiming, type Ultimate3Settings} from './settings';

export type ChapterSegment = {id: ChapterId; label: string; start: number; duration: number; end: number};
const labels: Record<ChapterId, string> = {ultimate2: '17 Ultimate 2', cost: '16 Cost', flow: '13 Introducing Flow-1', issues: '20 Issue clusters 3', conclusion: 'Conclusion'};
export function chapterSchedule(input: Ultimate3Settings) {
  const settings = normalizeSettings(input); const floors = chapterFloors(settings); let start = 0;
  return CHAPTER_IDS.map(id => {const duration = Math.max(settings.allocations[id], floors[id]); const segment = {id, label: labels[id], start, duration, end: start + duration}; start += duration; return segment;});
}
export const ultimate3Duration = (settings: Ultimate3Settings) => chapterSchedule(settings).at(-1)!.end;
export const ultimate3DurationFrames = (settings: Ultimate3Settings) => Math.ceil(ultimate3Duration(settings) * 30);
export function locateChapter(timeInput: number, settings: Ultimate3Settings) {
  const schedule = chapterSchedule(settings); const total = schedule.at(-1)!.end;
  const time = Number.isFinite(timeInput) ? Math.max(0, Math.min(total, timeInput)) : 0;
  const segment = schedule.find(item => time < item.end) ?? schedule.at(-1)!;
  return {time, segment, localTime: Math.max(0, Math.min(segment.duration, time - segment.start)), schedule};
}
const progress = (time: number, timing: ClipTiming) => {
  if (timing.duration === 0) return Number(time >= timing.at);
  const config = {value: {at: timing.at, duration: timing.duration, from: {progress: 0}, to: {progress: 1}, transition: timing.transition ?? {type: 'easing', duration: timing.duration, ease: [.45,0,.55,1]}}};
  const resolved = computeStaticTimeline(parseTimelineConfig(config), {}).clips[0];
  return Math.max(0, Math.min(1, (computeClipState(resolved, time, time) as {current: {progress: number}}).current.progress));
};
export function sampleFlow(localChapterTime: number, settings: Ultimate3Settings): {entryProgress: number; nativeTime: number; playback: FlowPlayback} {
  const entry = settings.flow.entrySlide; const entryEnd = entry.at + entry.duration;
  const nativeTime = Math.min(flowEndpoint(settings), Math.max(0, localChapterTime - entryEnd));
  const timing = Object.fromEntries(FLOW_CLIP_KEYS.map(key => {
    if (key === 'cloudReveal') return [key, {at: 0, duration: 0}];
    const source = settings.flow.timing[key]; return [key, {at: source.at, duration: source.duration}];
  })) as FlowPlayback['timing'];
  const flowProgress = Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, key === 'cloudReveal' ? 1 : progress(nativeTime, settings.flow.timing[key])])) as FlowPlayback['progress'];
  return {entryProgress: progress(localChapterTime, entry), nativeTime, playback: {time: nativeTime, timing, progress: flowProgress}};
}
export type Ultimate3Sample = {time: number; chapter: ChapterId; localTime: number; schedule: ChapterSegment[]; ultimate2?: Micro17Playback; cost?: Micro16State; flow?: ReturnType<typeof sampleFlow> & {outgoingCost: Micro16State}; issues?: ReturnType<typeof sampleIssues>; conclusion?: 'placeholder'|'logo'; conclusionSource?: ReturnType<typeof sampleMicro20>};
export function sampleUltimate3(time: number, input: Ultimate3Settings): Ultimate3Sample {
  const settings = normalizeSettings(input); const located = locateChapter(time, settings); const base = {time: located.time, chapter: located.segment.id, localTime: located.localTime, schedule: located.schedule};
  if (located.segment.id === 'ultimate2') return {...base, ultimate2: sampleMicro17(Math.min(located.localTime, ultimate2Endpoint(settings)), settings.ultimate2.timing)};
  if (located.segment.id === 'cost') return {...base, cost: sampleMicro16(Math.min(located.localTime, costEndpoint(settings)), settings.cost.controls, settings.cost.timing)};
  if (located.segment.id === 'flow') return {...base, flow: {...sampleFlow(located.localTime, settings), outgoingCost: sampleMicro16(costEndpoint(settings), settings.cost.controls, settings.cost.timing)}};
  if (located.segment.id === 'issues') {
    return {...base, issues: sampleIssues(located.localTime, settings)};
  }
  if (located.localTime >= settings.conclusion.logo.at) return {...base, conclusion: 'logo'};
  const terminal = sampleIssues(issueEntryEnd(settings) + issueEndpoint(settings), settings).source20;
  const conclusionSource = terminal.phase === 'issues' ? {...terminal, outro: sampleIssueOutro(terminal.issue, located.localTime, settings.conclusion.placeholder)} : terminal;
  return {...base, conclusionSource, conclusion: 'placeholder'};
}

/** The entry is a camera move, not part of source20's native clock. */
export function sampleIssues(localTime: number, settings: Ultimate3Settings) {
  const i = settings.issues;
  const nativeTime = Math.min(issueEndpoint(settings), Math.max(0, localTime - issueEntryEnd(settings)));
  const source20 = sampleMicro20(nativeTime, i.preludeControls, i.preludeTiming, i.controls, i.timing, i.issueStart, false);
  return {entering: localTime < issueEntryEnd(settings), entryProgress: issueEntryProgress(localTime, settings), nativeTime,
    source20, postludeActive: localTime >= issueEntryEnd(settings) && source20.phase === 'issues', postludeOffset: issuePostludeOffset(settings),
    // Compatibility-only shape for existing postlude consumers. Before the
    // handoff this opening sample is NOT visible; gate events on postludeActive.
    sample: source20.phase === 'issues' ? source20.issue : sampleMicro15(0, {...i.controls, warningAppearanceDuration: 0}, i.timing)};
}

/** Validate the settled handoff, not an ordinarily unfinished playback frame. */
export function issueHandoffValidation(settings: Ultimate3Settings) {
  const i = settings.issues;
  return sampleMicro20(issuePreludeEnd(settings), i.preludeControls, i.preludeTiming,
    i.controls, i.timing, i.issueStart).validation;
}

/** Camera travel normalizes authored endpoints to its two physical poses.
 * Zero-duration bars arrive instantly; spring tails finish before native time. */
export function issueEntryProgress(time: number, settings: Ultimate3Settings) {
  const clip = settings.issues.leadIn;
  if (time >= issueEntryEnd(settings)) return 1;
  if (time <= clip.at) return 0;
  const from = clip.from?.progress ?? 0, to = clip.to?.progress ?? 1;
  return to === from ? 0 : unit((evaluateClip(clip, time) - from) / (to - from));
}
