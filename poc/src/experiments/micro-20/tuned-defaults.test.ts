import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {MICRO_20_TIMELINE, PRELUDE_TIMING, effectiveIssueStart, micro20DurationFrames, type PreludeTiming} from './timeline';

test('all requested prelude defaults retain exact endpoints and easing', () => {
  const expected = {
    blueBashEntry: [.4, .75], blueBashStop: [1.1, .25], bashExpand: [1.45, .2],
    bashDescent: [1.6, 1.69], bashHighlight: [2.85, .55], analysisZoomOut: [3.45, 2],
    analysisTraceCollapse: [4.65, .6], analysisLocalGridFade: [4.65, .6],
    analysisCircleGrow: [5.25, 1.9], analysisCircleFade: [7.05, .35],
    analysisAgentScaleOut: [7.05, .45], analysisLayout: [7.05, .45],
  };
  for (const [key, [at, duration]] of Object.entries(expected)) {
    assert.deepEqual(MICRO_20_TIMELINE[key as keyof PreludeTiming], {
      at, duration, from: {progress: 0}, to: {progress: 1},
      transition: {type: 'easing', duration, ease: [.45, 0, .55, 1]},
    }, key);
  }
});
test('all requested issue defaults are exposed in global seconds, including subtitle springs', () => {
  const expected = {
    travelStart: [8.65, .35], coverAppearance: [9.58, .38], triangleScaleOut: [9.22, .59], triangleScaleIn: [9.59, .68],
    agentWindowEnter: [11.76, .47], promptTyping: [11.77, .44], issueTyping: [12.14, .27], issuePadding: [12.15, .35],
    issueBackground: [12.14, .2], issueWarningIn: [12.29, .3], messageSend: [12.58, .18], cliCommandTyping: [12.71, .33],
    sqlQueryTyping: [12.96, .23], sqlPredicateTyping: [13.13, .27], queryWarningIn: [13.22, .2], agentWindowExit: [14.12, .38],
    subtitleIssues: [7.5, .94], subtitlePatterns: [8.44, 2.42], subtitleReady: [10.82, 3.68],
  };
  for (const [key, [at, duration]] of Object.entries(expected)) {
    const clip = MICRO_20_TIMELINE.issues[key];
    assert.equal(clip.at, at, key); assert.equal(clip.duration, duration, key);
    if (key.startsWith('subtitle')) {
      assert.deepEqual(clip.transition, {type: 'spring', bounce: .2});
      assert.deepEqual(clip.from, {progress: 0}); assert.deepEqual(clip.to, {progress: 1});
    }
  }
});
test('earliest-start dependencies remain intact and the existing DialKit handoff note is retained', () => {
  assert.equal(effectiveIssueStart(PRELUDE_TIMING), 8.45);
  assert.equal(micro20DurationFrames(), 526);
  const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(source, /\/\/ TODO\(production\): DialKit's clip.current values are the scrubbable authoring preview\.\n  \/\/ Replace them with equivalent real Motion animations using the tuned timeline\n  \/\/ timings and transitions, then remove useDialTimeline and <DialTimeline \/>\.\n  const timeline = useDialTimeline\('Animation 20 · Earliest starts \(global seconds\)', \{\.\.\.MICRO_20_TIMELINE, duration\}/);
});
