import {clipEnd, evaluateClip, unit, type IssueTiming, type PreludeTiming} from './timeline';

export const NARRATION = {
  flow: 'our agent built to analyze traces',
  scale: 'at scale',
  detection: 'It finds deep issues,',
  everyTrace: 'In every trace,',
  patterns: 'and clusters them into high-level patterns,',
  ready: 'Ready for you or your coding agent.',
} as const;
export type NarrationKey = keyof typeof NARRATION;

/** Screen-space captions. Later captions win overlapping authored lifetimes.
 * Every-trace narration bridges the scan and the existing Issues subtitle bar,
 * without blinking when the world hands off to the clustering renderer.
 */
export function sampleNarration(time: number, prelude: PreludeTiming, issues: IssueTiming, issueStart: number): NarrationKey | null {
  const windows: [NarrationKey, number, number][] = [
    ['flow', prelude.subtitleFlow.at, clipEnd(prelude.subtitleFlow)],
    ['scale', prelude.analysisZoomOut.at, clipEnd(prelude.analysisZoomOut)],
    ['detection', prelude.subtitleDetection.at, clipEnd(prelude.subtitleDetection)],
    ['everyTrace', clipEnd(prelude.subtitleDetection), issueStart + clipEnd(issues.subtitleIssues)],
    ['patterns', issueStart + issues.subtitlePatterns.at, issueStart + clipEnd(issues.subtitlePatterns)],
    ['ready', issueStart + issues.subtitleReady.at, issueStart + clipEnd(issues.subtitleReady)],
  ];
  return windows.reverse().find(([, start, end]) => time >= start && time < end)?.[0] ?? null;
}

/** Retain authored from/to/transition-driven fades, matching source15's policy. */
export function narrationOpacity(key: NarrationKey | null, time: number, prelude: PreludeTiming, issues: IssueTiming, issueStart: number) {
  if (!key) return 0;
  if (key === 'everyTrace' && time < issueStart + issues.subtitleIssues.at) return 1;
  const clip = key === 'flow' ? prelude.subtitleFlow : key === 'scale' ? prelude.analysisZoomOut : key === 'detection' ? prelude.subtitleDetection
    : key === 'everyTrace' ? issues.subtitleIssues : key === 'patterns' ? issues.subtitlePatterns : issues.subtitleReady;
  const progress = evaluateClip(clip, key === 'flow' || key === 'scale' || key === 'detection' ? time : time - issueStart);
  // Every-trace copy is already visible before handoff: don't fade it in twice.
  return unit(Math.min(1, key === 'everyTrace' ? 1 : progress / .12, (1 - progress) / .12));
}
