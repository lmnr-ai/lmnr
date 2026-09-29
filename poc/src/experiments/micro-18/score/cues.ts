import {resolveMicro16Clips} from '../../micro-16/timeline';
import {sampleUltimate3, chapterSchedule, ultimate3DurationFrames, issueHandoffValidation} from '../sample';
import {beadStagger} from '../../introducing-flow-1-2/beads';
import {resolvePreludeSchedule} from '../../micro-20/timeline';
import {normalizeMicro22Timing} from '../../micro-22/timeline';
import {issueEntryEnd, issuePostludeOffset, normalizeSettings, type ChapterId, type ClipTiming, type Ultimate3Settings} from '../settings';
import {ultimate3TypingWindows, ultimate3TypingTickEvents} from '../typing-audio';
import {worldState, visibleRouteBlocks} from '../../micro-17/geometry';
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
  const issuesNative = round(issuesStart + issuePostludeOffset(settings));
  const postludeActive = !issueHandoffValidation(settings) && issuesNative < chapter.issues.end;
  const issues = settings.issues.timing;
  const preludeStart = round(issuesStart + issueEntryEnd(settings)), prelude = resolvePreludeSchedule(settings.issues.preludeTiming);
  // Source22 plays its own prelude (report bubble, labels, explanation); source20's schedule is only its fallback.
  const source22 = settings.issues.sourceVersion === 22, prelude22 = normalizeMicro22Timing(settings.issues.timing22), p = source22 ? prelude22 : prelude;
  const clouds = ultimate3CloudWhooshWindows(settings);
  const flow21 = settings.flow.sourceVersion === 21 && settings.flow.timing21;
  // Animation 21 has no number rows or bars: the six bead landings are the drops, the graph spread is the swap.
  const bead = (i: number) => {
    const beads = (flow21 as NonNullable<typeof settings.flow.timing21>).beadsEntry;
    const {duration, gap} = beadStagger(beads.duration, settings.flow.controls.beadStaggerSeconds);
    // Bead i lands one travel after its start, as a fraction of the (possibly sub-50ms) authored bar.
    return round(flowNative + beads.at + beads.duration * (duration + (i - 5) * gap) / duration);
  };
  const flowCues = flow21 ? {
    animation21: true,
    cloudExit: span(flowNative, flow21.cloudExit),
    cameraZoom: span(flowNative, flow21.cameraZoom),
    benchmark: at(flowNative, flow21.benchmarkHeading),
    numberDrops: Array.from({length: 6}, (_, i) => bead(i)),
    countUp: span(flowNative, flow21.ballEntry),
    cameraToAnalysis: span(flowNative, flow21.graphSpread),
    numberSwap: span(flowNative, flow21.graphSpread),
    barsGrow: span(flowNative, flow21.graphSpread),
    analysisCountUp: span(flowNative, flow21.xAxisEntry),
    cameraToEngine: span(flowNative, flow21.cameraToEngine),
    moduleActivation: at(flowNative, flow21.moduleActivation),
    engineSpinner: span(flowNative, flow21.engineSpinner),
    cover: span(flowNative, flow21.coverDescent),
    coverShut: round(flowNative + flow21.coverDescent.at + flow21.coverDescent.duration - .05),
    coverTint: span(flowNative, flow21.coverTint),
  } : {
    animation21: false,
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
  };

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
      blocks: streamBlocks(settings, chapter.ultimate2),
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
      ...flowCues,
    },
    issues: {
      postludeActive,
      leadIn: {at: issuesStart, duration: round(issuesNative - issuesStart)},
      // The analysis prelude between the Signals door and the issue grid.
      prelude: {
        source22,
        bashEntry: span(preludeStart, p.blueBashEntry),
        bashStop: at(preludeStart, p.blueBashStop),
        descent: span(preludeStart, p.bashDescent),
        highlight: at(preludeStart, p.bashHighlight),
        // Source22's report: the bubble opens, the label rows reveal, the explanation types, the bubble leaves.
        bubble: source22 ? at(preludeStart, prelude22.bubble) : undefined,
        labels: source22 ? span(preludeStart, prelude22.labelReveal) : undefined,
        explanation: source22 ? span(preludeStart, prelude22.explanationTyping) : undefined,
        bubbleExit: source22 ? at(preludeStart, prelude22.bubbleExit) : undefined,
        zoomOut: span(preludeStart, p.analysisZoomOut),
        collapse: at(preludeStart, p.analysisTraceCollapse),
        circleGrow: span(preludeStart, p.analysisCircleGrow),
        scaleOut: at(preludeStart, p.analysisAgentScaleOut),
      },
      native: issuesNative,
      pops: postludeActive ? issuePops(settings, issuesNative) : [],
      travel: {at: round(issuesNative + issues.travelStart.at), duration: settings.issues.controls.travelDuration},
      clusters: postludeActive ? clusterLocks(settings, issuesNative) : [],
      ready: at(issuesNative, issues.subtitleReady),
      windowDown: span(issuesNative, issues.agentWindowEnter),
      windowShut: round(issuesNative + issues.agentWindowEnter.at + issues.agentWindowEnter.duration - .05),
      typing: ultimate3TypingWindows(settings).map(window => ({at: round(window.start), duration: round(window.end - window.start)})),
      typingEvents: ultimate3TypingTickEvents(settings),
      issueBadge: at(issuesNative, issues.issueWarningIn),
      messageSend: at(issuesNative, issues.messageSend),
      queryBadge: at(issuesNative, issues.queryWarningIn),
      windowUp: span(issuesNative, issues.agentWindowExit),
    },
    /** Narration phrases, so music can answer in the gaps; empty for the unnarrated cut. */
    voice: Object.values(settings.voiceover?.phrases ?? {}).map(({at, duration}): Span => ({at: round(at), duration: round(duration)})).sort((a, b) => a.at - b.at),
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
  // Token ids name home (cluster) cells; the triangle pops wherever the token is drawn at that moment.
  const seen = new Map<string, {time: number; x: number; y: number}>();
  const step = 1 / 240;
  let last: ReturnType<typeof sampleUltimate3> | undefined;
  for (let time = native; time <= native + appearance.at + appearance.duration + .1; time += step) {
    last = sampleUltimate3(time, settings);
    const sample = last.issues?.postludeActive ? last.issues.sample : undefined;
    for (const [id, value] of Object.entries(sample?.warningAppearance ?? {})) {
      if (value <= 0 || seen.has(id)) continue;
      const pose = sample!.tokens.find(item => item.token.id === id)!;
      seen.set(id, {time: round(time - step / 2), x: pose.x, y: pose.y});
    }
  }
  const dots = last?.issues?.sample.groundDots ?? [];
  const xs = dots.map(dot => dot.x), ys = dots.map(dot => dot.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [...seen.values()].map(({time, x, y}) =>
    ({at: time, pan: ((x - minX) / (maxX - minX || 1)) * 1.6 - .8, height: 1 - (y - minY) / (maxY - minY || 1)})).sort((a, b) => a.at - b.at);
}

/** When each opening stream block starts to draw; icons are the small square tool badges. */
function streamBlocks(settings: Ultimate3Settings, span: {start: number; end: number}) {
  const seen = new Map<string, {at: number; icon: boolean}>();
  for (let time = span.start; time < span.end; time += 1 / 240) {
    const playback = sampleUltimate3(time, settings).ultimate2;
    if (!playback) continue;
    const state = worldState(playback, settings.ultimate2.controls, settings.ultimate2.streamBlocksRemoved);
    if (!state.streamVisible || state.bigGridVisible) continue;
    for (const block of visibleRouteBlocks(state, -2000, 2000)) if (!seen.has(block.key))
      seen.set(block.key, {at: round(time), icon: !block.label});
  }
  return [...seen.values()].sort((a, b) => a.at - b.at);
}

function clusterLocks(settings: Ultimate3Settings, native: number) {
  const sample = sampleUltimate3(native + settings.issues.timing.travelStart.at, settings);
  return Object.values(sample.issues?.postludeActive ? sample.issues.sample.clusters : {}).map(cluster => round(native + cluster.readyAt)).sort((a, b) => a - b);
}

