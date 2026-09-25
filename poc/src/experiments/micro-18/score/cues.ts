import {resolveMicro16Clips} from '../../micro-16/timeline';
import {sampleUltimate3, chapterSchedule, ultimate3DurationFrames} from '../sample';
import {normalizeSettings, type ChapterId, type ClipTiming, type Ultimate3Settings} from '../settings';
import {ultimate3CheapAgentWhooshWindows, ultimate3CloudWhooshWindows, ultimate3FlowNumberDropTimes, ultimate3FlowRatchetWindow} from '../sound';

export type Span = {at: number; duration: number};
export type IssuePop = {at: number; pan: number; height: number};

/** Every picture event the score reacts to, in absolute composition seconds. */
export type ScoreCues = ReturnType<typeof ultimate3ScoreCues>;

export const SCORE_BPM = 120;
export const BEAT = 60 / SCORE_BPM;
const round = (value: number) => Math.round(value * 1e9) / 1e9;

/** Pure function of settings: the score follows any retime of the authored clips. */
export function ultimate3ScoreCues(input: Ultimate3Settings) {
  const settings = normalizeSettings(input);
  const schedule = chapterSchedule(settings);
  const chapter = Object.fromEntries(schedule.map(item => [item.id, {start: item.start, end: item.end}])) as Record<ChapterId, {start: number; end: number}>;
  const duration = ultimate3DurationFrames(settings) / 30;
  const span = (offset: number, clip: ClipTiming): Span => ({at: round(offset + clip.at), duration: clip.duration});
  const at = (offset: number, clip: ClipTiming) => round(offset + clip.at);

  const u2 = settings.ultimate2.timing, u2Start = chapter.ultimate2.start;
  const cost = settings.cost.timing, costStart = chapter.cost.start;
  const costResolved = resolveMicro16Clips(cost);
  const resolvedCost = (key: keyof typeof cost): Span => ({at: round(costStart + cost[key].at), duration: cost[key].duration === 0 ? 0 : costResolved.find(clip => clip.key === key)!.duration});
  const flowStart = chapter.flow.start, entry = settings.flow.entrySlide;
  const flowNative = round(flowStart + entry.at + entry.duration), flow = settings.flow.timing;
  const issuesStart = chapter.issues.start;
  const issuesNative = round(issuesStart + settings.issues.leadIn.at + settings.issues.leadIn.duration);
  const issues = settings.issues.timing;
  const clouds = ultimate3CloudWhooshWindows(settings);

  return {
    duration, chapter,
    ultimate2: {
      agentEnter: at(u2Start, u2.agentEnter),
      firstThinking: span(u2Start, u2.firstThinking),
      stream: span(u2Start, u2.streamRun),
      failure: at(u2Start, u2.continueStraight),
      upwardTurn: span(u2Start, u2.upwardTurn),
      backtrack: span(u2Start, u2.cameraBacktrack),
      drawers: [u2.redThinkingLift, u2.readLift, u2.thinkingLift].map(clip => at(u2Start, clip)),
      highlight: span(u2Start, u2.highlight),
      warning: at(u2Start, u2.warningEnter),
      insights: at(u2Start, u2.warningFocus),
      zoom: span(u2Start, u2.finalZoom),
      collapse: span(u2Start, u2.streamCollapse),
      cloudIn: clouds.cloudIn!,
      ifOnly: at(u2Start, u2.subtitleIfOnly),
    },
    cost: {
      cloudOut: clouds.cloudOut!,
      cheapLegs: ultimate3CheapAgentWhooshWindows(settings),
      thinkingDrop: span(costStart, cost.thinkingDrop),
      missIssues: at(costStart, cost.subtitleMissIssues),
      cameraToBash: resolvedCost('cameraDownToBash'),
      powerful: at(costStart, cost.subtitlePowerful),
      bashEntry: span(costStart, cost.purpleBashEntry),
      bashStop: at(costStart, cost.purpleBashStop),
      bashExpand: at(costStart, cost.bashExpand),
      bashDescent: span(costStart, cost.bashDescent),
      bashHighlight: span(costStart, cost.bashHighlight),
      bashWarning: at(costStart, cost.bashWarning),
      cameraToBudget: resolvedCost('cameraDownToBudget'),
      budgetEntry: span(costStart, cost.purpleBudgetEntry),
      budgetAppear: at(costStart, cost.budgetAppear),
      budgetRun: span(costStart, cost.budgetRun),
      smokeEnter: at(costStart, cost.smokeEnter),
      depletion: span(costStart, cost.budgetDepletion),
    },
    flow: {
      entry: span(flowStart, entry),
      // The title lands two beats into the camera lift; that is the drop.
      reveal: round(flowStart + Math.min(entry.at + entry.duration, 2 * BEAT)),
      native: flowNative,
      cloudExit: span(flowNative, flow.cloudExit),
      cameraZoom: span(flowNative, flow.cameraZoom),
      benchmark: at(flowNative, flow.benchmarkHeading),
      numberDrops: ultimate3FlowNumberDropTimes(settings),
      countUp: span(flowNative, flow.percentageCountUp),
      cameraToAnalysis: span(flowNative, flow.cameraToAnalysis),
      numberSwap: span(flowNative, flow.numberSwap),
      barsGrow: ultimate3FlowRatchetWindow(settings),
      analysisCountUp: span(flowNative, flow.analysisCountUp),
      cameraToEngine: span(flowNative, flow.cameraToEngine),
      moduleActivation: at(flowNative, flow.moduleActivation),
      engineSpinner: span(flowNative, flow.engineSpinner),
      cover: span(flowNative, flow.coverDescent),
      coverShut: round(flowNative + flow.coverDescent.at + flow.coverDescent.duration - .05),
      coverTint: span(flowNative, flow.coverTint),
    },
    issues: {
      leadIn: {at: issuesStart, duration: round(issuesNative - issuesStart)},
      native: issuesNative,
      pops: issuePops(settings, issuesNative),
      travel: {at: round(issuesNative + issues.travelStart.at), duration: settings.issues.controls.travelDuration},
      clusters: clusterLocks(settings, issuesNative),
      ready: at(issuesNative, issues.subtitleReady),
      windowDown: span(issuesNative, issues.agentWindowEnter),
      windowShut: round(issuesNative + issues.agentWindowEnter.at + issues.agentWindowEnter.duration - .05),
      typing: typingWindows(settings, issuesNative),
      issueBadge: at(issuesNative, issues.issueWarningIn),
      messageSend: at(issuesNative, issues.messageSend),
      queryBadge: at(issuesNative, issues.queryWarningIn),
      windowUp: span(issuesNative, issues.agentWindowExit),
    },
    conclusion: {
      start: chapter.conclusion.start,
      logo: round(chapter.conclusion.start + settings.conclusion.logo.at),
      end: chapter.conclusion.end,
    },
  };
}

/** Sample the Issues scene once to learn when and where each triangle appears. */
function issuePops(settings: Ultimate3Settings, native: number): IssuePop[] {
  const appearance = settings.issues.timing.appearance;
  const seen = new Map<string, number>();
  const step = 1 / 240;
  let last: ReturnType<typeof sampleUltimate3> | undefined;
  for (let time = native; time <= native + appearance.at + appearance.duration + .1; time += step) {
    last = sampleUltimate3(time, settings);
    for (const [cell, value] of Object.entries(last.issues?.sample.warningAppearance ?? {})) if (value > 0 && !seen.has(cell)) seen.set(cell, round(time - step / 2));
  }
  const dots = last?.issues?.sample.groundDots ?? [];
  const xs = dots.map(dot => dot.x), ys = dots.map(dot => dot.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [...seen].map(([cell, time]) => {
    const dot = dots.find(item => `cell-${item.cell}` === cell);
    return {at: time, pan: dot ? ((dot.x - minX) / (maxX - minX || 1)) * 1.6 - .8 : 0, height: dot ? 1 - (dot.y - minY) / (maxY - minY || 1) : .5};
  }).sort((a, b) => a.at - b.at);
}

function clusterLocks(settings: Ultimate3Settings, native: number) {
  const sample = sampleUltimate3(native + settings.issues.timing.travelStart.at, settings);
  return Object.values(sample.issues?.sample.clusters ?? {}).map(cluster => round(native + cluster.readyAt)).sort((a, b) => a - b);
}

function typingWindows(settings: Ultimate3Settings, native: number): Span[] {
  const timing = settings.issues.timing;
  const sendEnd = timing.messageSend.at + timing.messageSend.duration;
  const afterSend = (clip: ClipTiming) => ({...clip, at: Math.max(clip.at, sendEnd)});
  const windows = [timing.promptTyping, timing.issueTyping, afterSend(timing.cliCommandTyping), afterSend(timing.sqlQueryTyping), afterSend(timing.sqlPredicateTyping)]
    .filter(clip => clip.duration > 0).map(clip => ({start: native + clip.at, end: native + clip.at + clip.duration})).sort((a, b) => a.start - b.start);
  const merged: {start: number; end: number}[] = [];
  for (const window of windows) {
    const previous = merged.at(-1);
    if (previous && window.start <= previous.end) previous.end = Math.max(previous.end, window.end); else merged.push({...window});
  }
  return merged.map(window => ({at: round(window.start), duration: round(window.end - window.start)}));
}
