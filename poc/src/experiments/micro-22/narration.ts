import {clipEnd, MICRO_20_ISSUE_TIMING, type IssueTiming} from '../micro-20/timeline';
import {micro22PreludeEnd, type Micro22Timing} from './timeline';
import {NARRATION as SOURCE20_NARRATION} from '../micro-20/narration';
export const NARRATION = {
  subtitleFlow: 'Flow-1 powers Signals, our agent built to analyze traces at scale.',
  subtitleDetection: 'It finds deep issues,',
  subtitleReporting: 'and reports them.',
  subtitleLabels: 'Not just with labels,',
  subtitleStructure: 'but with any structure you define,',
  subtitleEveryTrace: 'across every trace.',
  subtitlePatterns: SOURCE20_NARRATION.patterns,
  subtitleReady: SOURCE20_NARRATION.ready,
} as const;
export function sampleNarration(time: number, timing: Micro22Timing, issues: IssueTiming = MICRO_20_ISSUE_TIMING, issueStart = micro22PreludeEnd(timing)) {
  return (Object.keys(NARRATION) as (keyof typeof NARRATION)[]).reverse().find(key => {
    if (key === 'subtitlePatterns' || key === 'subtitleReady') return time >= issueStart + issues[key].at && time < issueStart + clipEnd(issues[key]);
    return time >= timing[key].at && time < (key === 'subtitleEveryTrace' ? Math.max(clipEnd(timing[key]), issueStart + clipEnd(issues.subtitleIssues)) : clipEnd(timing[key]));
  }) ?? null;
}
