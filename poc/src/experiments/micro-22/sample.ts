import {spinnerAngle} from '../micro-20/spinner';
import {sampleMicro20} from '../micro-20/sample';
import {evaluateClip, PRELUDE_KEYS, normalizeMicro20Controls, unit, type ClipTiming, type PreludeTiming, type IssueTiming} from '../micro-20/timeline';
import {sampleIssueOutro} from '../micro-20/outro';
import {micro22Endpoint, micro22PreludeEnd, normalizeMicro22IssueTiming, MICRO_22_KEYS, normalizeMicro22Controls, normalizeMicro22Timing, type Micro22Key, type Micro22Props} from './timeline';
import {sampleNarration} from './narration';
export type Micro22Progress = Record<Micro22Key, number>;
export const REPORT_EXPLANATION = 'The agent ignored a real warning in the Bash tool output and falsely reported to the user no issues remained.';
export const REPORT_FIELDS = [{name: 'is_hallucination', value: 'true', color: '#76aaf9'}, {name: 'is_user_frustration', value: 'false', color: '#dadada'}, {name: 'severity', value: 'critical', color: '#fc948e'}] as const;
export function reportGeometry(labels: number, explanation: number) {
  const l = unit(labels), e = unit(explanation), height = 154 + 46 * l + 216 * e;
  return {x: 463 - 355 * l, y: 360 - height / 2, width: 154 + 343 * l, height, centerY: 360, tailWidth: 44, tailHeight: 51};
}
export function reportRowMotion(progress: number, index: number) {
  const p = unit((unit(progress) - index * .2) / .6);
  return {opacity: p, y: 20 * (1 - p)};
}
export function explanationWordCount(progress: number) {
  return Math.floor(unit(progress) * REPORT_EXPLANATION.split(' ').length);
}
export function sampleMicro22(timeInput: number, props: Micro22Props = {}, live?: Partial<Micro22Progress>, outro?: {time: number; clip: ClipTiming}, liveIssues?: Partial<Record<keyof IssueTiming, number>>) {
  const time = Number.isFinite(timeInput) ? Math.max(0, timeInput) : 0;
  const timing = normalizeMicro22Timing(props.timing), controls = normalizeMicro22Controls(props.controls);
  const issueTiming = normalizeMicro22IssueTiming(props.issueTiming), issueStart = micro22PreludeEnd(timing);
  const end = micro22Endpoint(timing, issueTiming, props.issueControls), native = Math.min(time, end);
  const progress = Object.fromEntries(MICRO_22_KEYS.map(key => [key, live?.[key] ?? evaluateClip(timing[key], native)])) as Micro22Progress;
  const preludeProgress = Object.fromEntries(PRELUDE_KEYS.map(key => [key, progress[key]])) as Record<keyof PreludeTiming, number>;
  const base = sampleMicro20(native, {spinnerSpeed: controls.spinnerSpeed}, undefined, props.issueControls, issueTiming, issueStart, false, preludeProgress, {progress: liveIssues});
  const zoom = unit(progress.analysisZoomOut);
  const world = base.phase === 'issues' ? {...base, outro: outro || time > end
    ? sampleIssueOutro(base.issue, outro?.time ?? time - end, outro?.clip) : null} : (() => {
    const origin = {...base.origin, y: base.origin.y - unit(progress.reportFocus) * (1 - zoom), x: base.origin.x + 406 * unit(progress.reportFocus) * (1 - zoom)};
    const angle = spinnerAngle(native, timing, normalizeMicro20Controls({spinnerSpeed: controls.spinnerSpeed}));
    return {...base, origin, bashAgent: {...base.bashAgent, angle}, detectionWarning: {...base.detectionWarning, scale: 0}, hero: {...base.hero, x: origin.x, angle}};
  })();
  const narration = sampleNarration(native, timing, issueTiming, issueStart);
  const captionProgress = narration === 'subtitlePatterns' || narration === 'subtitleReady' ? liveIssues?.[narration] ?? evaluateClip(issueTiming[narration], native - issueStart)
    : narration === 'subtitleEveryTrace' && native >= issueStart ? liveIssues?.subtitleIssues ?? evaluateClip(issueTiming.subtitleIssues, native - issueStart)
    : narration ? progress[narration] : 0;
  const subtitleOpacity = narration === 'subtitleEveryTrace' ? (native < issueStart ? unit(captionProgress / .08) : unit((1 - captionProgress) / .12))
    : narration === 'subtitlePatterns' || narration === 'subtitleReady' ? unit(Math.min(captionProgress / .12, (1 - captionProgress) / .12))
    : narration ? unit(Math.min(captionProgress / .08, (1 - captionProgress) / .08)) : 0;
  return {sourceVersion: 22 as const, time, end, progress, world, outro: !!outro || time > end,
    report: {...reportGeometry(progress.labels, progress.explanation),
      scale: unit(progress.bubble) * (1 - unit(progress.bubbleExit)),
      warningScale: 1 - unit(progress.warningExit),
      rows: REPORT_FIELDS.map((_, index) => reportRowMotion(progress.labelReveal, index)),
      explanationWords: explanationWordCount(progress.explanationTyping)},
    narration, subtitleOpacity};
}
export type Micro22Sample = ReturnType<typeof sampleMicro22>;
