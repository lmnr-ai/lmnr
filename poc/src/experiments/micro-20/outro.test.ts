import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sampleMicro20, sampleMicro20Frame} from './sample';
import {micro20DurationFrames, micro20PostludeDurationFrames, MICRO_20_ISSUE_TIMING, PRELUDE_TIMING} from './timeline';
import {OUTRO_CELLS, sampleIssueOutro} from './outro';
import {chapterSchedule, sampleUltimate3, ultimate3DurationFrames} from '../micro-18/sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from '../micro-18/settings';

const endpoint = sampleMicro20(15.5, undefined, undefined, undefined, undefined, undefined, false);
if (endpoint.phase !== 'issues') throw new Error('Expected terminal source pose');
const source = endpoint.issue;
test('outro starts on the actual unchanged postlude and reaches .4 with zero endpoint velocity', () => {
  const start = sampleIssueOutro(source, 0);
  assert.equal(start.issue, source);
  assert.equal(start.scale, 1);
  assert.ok(start.overlays.every(cell => cell.cell === undefined));
  assert.equal(source.agent.phase, 'exited');
  assert.equal(sampleIssueOutro(source, 2).scale, .4);
  let previous = 1;
  for (let frame = 0; frame <= 60; frame++) {
    const scale = sampleIssueOutro(source, frame / 30).scale;
    assert.ok(scale <= previous && scale >= .4); previous = scale;
  }
  assert.ok(1 - sampleIssueOutro(source, .001).scale < .00001);
  assert.ok(sampleIssueOutro(source, 1.999).scale - .4 < .00001);
  assert.ok(Math.min(...OUTRO_CELLS.map(c => c.x)) < 640 - 640 / .4 - 78);
  assert.ok(Math.max(...OUTRO_CELLS.map(c => c.x)) > 640 + 640 / .4 + 78);
  assert.ok(Math.min(...OUTRO_CELLS.map(c => c.y)) < 360 - 360 / .4 - 78);
  assert.ok(Math.max(...OUTRO_CELLS.map(c => c.y)) > 360 + 360 / .4 + 78);
});
test('real automaton spontaneously changes cells and colors with random/reverse seek parity', () => {
  const a = sampleIssueOutro(source, .25), b = sampleIssueOutro(source, .5);
  assert.ok(a.overlays.some(cell => cell.cell !== undefined));
  assert.ok(a.cells.some((cell, i) => cell.kind !== b.cells[i].kind));
  assert.ok(a.cells.some((cell, i) => cell.kind === 'triangle' && b.cells[i].kind === 'triangle' && cell.asset !== (b.cells[i] as {asset: string}).asset));
  const times = [2, 0, .75, 1.9, .25, 0, 1.9];
  const expected = times.map(t => sampleIssueOutro(source, t));
  times.reverse().forEach((t, i) => assert.deepEqual(sampleIssueOutro(source, t), expected.at(-i - 1)));
});
test('standalone includes the full closing segment and its exact final video frame, after retimed agent exit', () => {
  assert.equal(micro20PostludeDurationFrames(), 465);
  assert.equal(micro20DurationFrames(), 526);
  for (const issueTiming of [MICRO_20_ISSUE_TIMING, {...MICRO_20_ISSUE_TIMING, agentWindowExit: {at: 15, duration: 1}}]) {
    const preludeTiming = {...PRELUDE_TIMING, analysisLayout: {...PRELUDE_TIMING.analysisLayout, at: 10}};
    const props = {issueTiming, preludeTiming};
    const start = micro20PostludeDurationFrames(props) / 30;
    const before = sampleMicro20(start - 1 / 30, undefined, preludeTiming, undefined, issueTiming);
    assert.equal(before.phase === 'issues' && before.outro, null);
    const first = sampleMicro20(start, undefined, preludeTiming, undefined, issueTiming);
    assert.ok(first.phase === 'issues' && first.outro?.scale === 1 && first.issue.agent.phase === 'exited');
    const last = sampleMicro20Frame(micro20DurationFrames(props) - 1, undefined, preludeTiming, undefined, issueTiming);
    assert.ok(last.phase === 'issues' && last.outro?.scale === .4);
    assert.deepEqual(last, sampleMicro20((micro20DurationFrames(props) - 1) / 30, undefined, preludeTiming, undefined, issueTiming));
  }
});
test('Ultimate3 keeps all existing boundaries and plays this tail exactly once in its existing conclusion slot', () => {
  const settings = normalizeSettings(ULTIMATE_3_DEFAULTS);
  const schedule = chapterSchedule(settings);
  assert.deepEqual(schedule.map(s => s.duration), [14.51818181818182, 15, 13, 16.7, 4]);
  assert.equal(ultimate3DurationFrames(settings), 1897);
  const start = schedule[4].start;
  assert.equal(sampleUltimate3(start - .001, settings).issues?.source20.phase, 'issues');
  const issues = sampleUltimate3(start - .001, settings).issues!.source20;
  assert.ok(issues.phase === 'issues' && issues.outro === null);
  for (const t of [0, .25, 1, 1.9, 0]) {
    const u3 = sampleUltimate3(start + t, settings).conclusionSource;
    const standalone = sampleMicro20(15.5 + t);
    assert.ok(u3?.phase === 'issues' && standalone.phase === 'issues');
    assert.ok(Math.abs(u3.outro!.scale - standalone.outro!.scale) < 1e-12);
    assert.deepEqual(u3.outro!.cells, standalone.outro!.cells);
  }
  assert.equal(sampleUltimate3(start + 2, settings).conclusion, 'logo');
  const retimed = normalizeSettings({...settings, issues: {...settings.issues, timing: {...settings.issues.timing, agentWindowExit: {at: 15, duration: 1}}}, conclusion: {placeholder: {at: .5, duration: 3}, logo: {at: 3.5, duration: 2}}});
  const retimedStart = chapterSchedule(retimed)[4].start;
  const held = sampleUltimate3(retimedStart + .25, retimed).conclusionSource;
  assert.ok(held?.phase === 'issues' && held.outro?.scale === 1 && held.issue.agent.phase === 'exited');
  assert.equal(sampleUltimate3(retimedStart + 3.5, retimed).conclusion, 'logo');
});
test('authored offsets, endpoints, instant steps and transitions remain authoritative; blocked handoff never fabricates an end pose', () => {
  assert.equal(sampleIssueOutro(source, .4, {at: .5, duration: 0}).scale, 1);
  assert.equal(sampleIssueOutro(source, .5, {at: .5, duration: 0}).scale, .4);
  assert.equal(sampleIssueOutro(source, 2, {at: 0, duration: 1, to: {progress: .5}}).scale, .7);
  const spring = {at: .2, duration: 1, transition: {type: 'spring' as const, bounce: .2}};
  assert.deepEqual(sampleIssueOutro(source, .7, spring), sampleIssueOutro(source, .7, spring));
  const blocked = normalizeSettings({...ULTIMATE_3_DEFAULTS, issues: {...ULTIMATE_3_DEFAULTS.issues, preludeControls: {...ULTIMATE_3_DEFAULTS.issues.preludeControls, radialCircleRadius: 0}}});
  const result = sampleUltimate3(chapterSchedule(blocked)[4].start, blocked).conclusionSource;
  assert.ok(result && result.phase !== 'issues' && result.validation);
});
