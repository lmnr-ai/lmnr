import assert from 'node:assert/strict';
import test from 'node:test';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {COLORS, SMALL_WARNING} from '../micro-14/geometry';
import {mappedCellCenter} from './geometry';
import {sampleMicro15} from '../micro-15/sample';
import {sampleMicro16} from '../micro-16/sample';
import {worldState, DEFAULTS as WORLD_DEFAULTS} from '../micro-17/geometry';
import {sampleMicro17} from '../micro-17/sample';
import {HIGHLIGHT_LINES, PAPER_LINES, PAPER_LINE_HEIGHT} from './paper';
import {HERO_CELL, HERO_CENTER, requiredScanRadius, sampleMicro20, sampleMicro20Frame} from './sample';
import {ISSUE_START, MICRO_20_DEFAULTS, MICRO_20_ISSUE_DEFAULTS, MICRO_20_ISSUE_TIMING, MICRO_20_TIMELINE, PRELUDE_TIMING, effectiveIssueStart, evaluateClip, micro20DurationFrames, resolvePreludeSchedule, serializeTimeline, unit} from './timeline';

function prelude(time: number, controls = MICRO_20_DEFAULTS, timing = PRELUDE_TIMING) {
  const sample = sampleMicro20(time, controls, timing);
  if (sample.phase === 'issues') throw new Error('Expected prelude');
  return sample;
}
test('source16 Bash geometry and report baseline/door relationship throughout descent', () => {
  assert.equal(PAPER_LINES.length, 78);
  assert.equal(PAPER_LINE_HEIGHT, 30);
  for (const time of [.4, .7, 1.15, 1.3, 1.4, 1.8, 2.4, 2.85, 3.125, 3.4]) {
    const actual = prelude(time);
    const source = sampleMicro16(time, undefined, {
      cameraDownToBash: {at: 0, duration: 0}, purpleBashEntry: PRELUDE_TIMING.blueBashEntry,
      purpleBashStop: PRELUDE_TIMING.blueBashStop, bashExpand: PRELUDE_TIMING.bashExpand,
      bashDescent: PRELUDE_TIMING.bashDescent, bashHighlight: PRELUDE_TIMING.bashHighlight,
    });
    assert.equal(actual.bashAgent.x, source.bashAgent.x);
    assert.equal(actual.bashAgent.y, source.bashAgent.y);
    assert.equal(actual.camera.y, source.camera.y);
    assert.equal(actual.paperHeight, source.paperHeight);
    assert.equal(actual.progress.bashExpand, source.progress.bashExpand);
    if (time >= 2.85) for (const line of actual.highlightBounds) assert.ok(line.y < 720 && line.y + line.height > 0);
    if (time >= 1.5) {
      const visible = PAPER_LINES.filter((text, line) => text && 1261 + 4 + line * 30 - actual.camera.y > 0 && 1261 + line * 30 - actual.camera.y < 720);
      // The later tuned descent exposes 13 nonblank lines at the early 1.8s pose.
      assert.ok(visible.length >= 13, `${time}: ${visible.length} nonblank visible lines`);
    }
  }
  assert.deepEqual(HIGHLIGHT_LINES, [68, 69, 70]);
});
test('world transform and every paper point remain continuous across zoom onset', () => {
  const before = prelude(3.45 - 1e-6), after = prelude(3.45 + 1e-6);
  const project = (s: typeof before, x: number, y: number) => ({
    x: s.origin.x + (x - s.bashAgent.x) * s.contentScreenScale,
    y: s.origin.y + (y - s.bashAgent.y) * s.contentScreenScale * (1 - unit(s.progress.analysisTraceCollapse)),
  });
  for (const point of [[340, 1261], [700, 3661], [340, 3361]]) {
    const a = project(before, ...point as [number, number]), b = project(after, ...point as [number, number]);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < .001);
  }
  assert.ok(Math.abs(before.gridPitch - after.gridPitch) < .001);
});
test('source17 camera/content law retains gray/report scale while hero independently reaches 54px', () => {
  for (const zoom of [0, .25, .5, .75, 1]) {
    const timing = {...PRELUDE_TIMING, analysisZoomOut: {...PRELUDE_TIMING.analysisZoomOut, from: {progress: zoom}, to: {progress: zoom}}};
    const actual = prelude(5.5, MICRO_20_DEFAULTS, timing);
    const playback = sampleMicro17(0);
    playback.progress.finalZoom = zoom;
    const source = worldState(playback, WORLD_DEFAULTS);
    assert.ok(Math.abs(actual.contentScreenScale - source.scale * source.contentScale) < 1e-12);
    assert.ok(Math.abs(actual.hero.scale * 120 - 120 * (54 / 120) ** zoom) < 1e-8);
    assert.equal(actual.dots[0].radius, 60 * actual.contentScreenScale);
  }
});
test('real hero occupancy holds across zoom, scan and scale-out; adapter uses same cell identity', () => {
  for (const time of [3.45, 4, 4.45, 5.5, 6, 7.1, 7.2, 7.4]) {
    const sample = prelude(time), dot = sample.dots.find(dot => dot.cell === HERO_CELL)!;
    assert.equal(sample.hero.x, dot.x); assert.equal(sample.hero.y, dot.y);
  }
  const grid = prelude(5.55);
  assert.equal(grid.hero.x, 640); assert.equal(grid.hero.y, 360);
  assert.equal(grid.dots.filter(dot => dot.scale !== 1).length, 1);
  assert.equal(grid.dots.find(dot => dot.cell === HERO_CELL)!.scale, 0);
  for (const time of [7.05, 7.1, 7.2, 7.249]) {
    assert.equal(prelude(time).hero.x, 640);
    assert.equal(prelude(time).hero.y, 360);
  }
});
test('circle arrival is actual radius, no advance band or independently ending discovery track', () => {
  for (const time of [5.55, 5.9, 6.1, 6.325, 6.6, 7]) {
    const sample = prelude(time);
    for (const warning of sample.warnings) {
      if (sample.radius <= warning.distance) assert.equal(warning.scale, 0);
      if (sample.radius >= warning.distance + 35.1) assert.ok(warning.scale > .999999);
    }
  }
  assert.equal(prelude(5.55).radius, 0);
  assert.equal(prelude(5.55).zoom, 1);
});
test('insufficient radius holds analysis; exact full-arrival threshold and larger radii complete', () => {
  const required = requiredScanRadius(MICRO_20_DEFAULTS);
  for (const radius of [0, required - .001]) {
    const sample = sampleMicro20(20, {radialCircleRadius: radius});
    assert.equal(sample.phase, 'analysis');
    assert.ok(sample.warnings.some(warning => warning.scale < 1));
  }
  for (const radius of [required, required + 1, 900]) assert.equal(sampleMicro20(effectiveIssueStart(PRELUDE_TIMING), {radialCircleRadius: radius}).phase, 'issues');
  assert.equal(sampleMicro20(20, {radialCircleRadius: 0}).phase, 'analysis');
  assert.equal(sampleMicro20(20, {radialCircleRadius: 900}).phase, 'issues');
  assert.equal(sampleMicro20(20, {radialCircleRadius: 820}).phase, 'analysis');
});
test('default handoff equals mapped source15 world, warning size and dot occupancy without a camera reset', () => {
  const handoff = effectiveIssueStart(PRELUDE_TIMING, ISSUE_START);
  const before = prelude(handoff - 1e-8), after = sampleMicro20(handoff);
  assert.equal(after.phase, 'issues');
  if (after.phase !== 'issues') return;
  for (const warning of before.warnings) {
    const target: {x: number; y: number} = after.issueWorld.warnings.find(token => token.token.id === warning.id)!;
    assert.ok(Math.abs(warning.x - target.x) < 1e-6);
    assert.ok(Math.abs(warning.y - target.y) < 1e-6);
    assert.equal(warning.scale, 1);
    assert.ok(Math.abs(SMALL_WARNING.width * 10 * before.contentScreenScale - SMALL_WARNING.width) < 1e-8);
  }
  for (const dot of before.dots) {
    assert.ok(Math.abs(dot.x - mappedCellCenter(dot.cell).x) < 1e-6);
    assert.equal(dot.scale, after.issueWorld.groundDots.find(value => value.cell === dot.cell)!.scale);
    assert.ok(Math.abs(dot.radius - 6) < 1e-8);
  }
  assert.equal(COLORS.dot, '#4e4e4e');
  assert.deepEqual(HERO_CENTER, mappedCellCenter(HERO_CELL));
});
test('all source15 trajectories, merges and agent window remain unchanged; subtitles share full spring evaluator', () => {
  for (const local of [0, .1, .8, 1.2, 3.4, 4.5, 5.2, 5.8, 6.8, 7]) {
    const actual = sampleMicro20(effectiveIssueStart(PRELUDE_TIMING) + local);
    if (actual.phase !== 'issues') throw new Error('Expected postlude');
    const source = sampleMicro15(local, MICRO_20_ISSUE_DEFAULTS, MICRO_20_ISSUE_TIMING);
    const {subtitles: ignored, ...sourceGeometry} = source;
    const {subtitles, ...actualGeometry} = actual.issue;
    assert.deepEqual(actualGeometry, sourceGeometry);
    for (const key of ['subtitleIssues', 'subtitlePatterns', 'subtitleReady'] as const) assert.equal(subtitles[key], evaluateClip(MICRO_20_ISSUE_TIMING[key], local));
  }
});
test('actual DialKit extraction retains endpoints, edited easing, spring overshoot and zero-duration steps', () => {
  const flat = {
    'bashHighlight.from.progress': .1, 'bashHighlight.to.progress': .8,
    'bashHighlight.transition': {type: 'spring' as const, bounce: .8, visualDuration: .3},
    'bashExpand.duration': 0,
    'issues.subtitleIssues.from.progress': .2, 'issues.subtitleIssues.to.progress': .9,
    'issues.subtitleIssues.transition': {type: 'easing' as const, duration: .94, ease: [0, 0, 1, 1] as [number, number, number, number]},
  };
  const clips = computeStaticTimeline(parseTimelineConfig(MICRO_20_TIMELINE), flat).clips;
  for (const time of [0, 1.3, 3, 6.3, 7.6, 3.1, 10]) {
    const live: Record<string, unknown> = {issues: {}};
    for (const clip of clips) {
      const state = computeClipState(clip, time, time);
      if (clip.group) (live[clip.group] as Record<string, unknown>)[clip.childKey!] = state;
      else live[clip.key] = state;
    }
    const authored = serializeTimeline(live, flat);
    assert.equal(authored.preludeTiming.bashExpand.duration, 0);
    assert.equal(authored.preludeTiming.bashHighlight.from?.progress, .1);
    assert.equal(authored.preludeTiming.bashHighlight.to?.progress, .8);
    assert.equal(authored.issueTiming.subtitleIssues.from?.progress, .2);
    assert.equal(authored.issueTiming.subtitleIssues.to?.progress, .9);
    const saved = JSON.parse(JSON.stringify(authored));
    const sampled = sampleMicro20(time, undefined, authored.preludeTiming, undefined, authored.issueTiming);
    assert.equal(sampled.progress.bashHighlight, (live.bashHighlight as {current: {progress: number}}).current.progress);
    assert.deepEqual(sampled, sampleMicro20Frame(time * 30, undefined, saved.preludeTiming, undefined, saved.issueTiming));
  }
});
test('retimed preludes ripple intact, earliest handoff never truncates a phase', () => {
  const timing = {...PRELUDE_TIMING, bashDescent: {...PRELUDE_TIMING.bashDescent, at: 9, duration: 3}};
  const scheduled = resolvePreludeSchedule(timing), start = effectiveIssueStart(timing, 1);
  assert.ok(scheduled.analysisZoomOut.at >= 12);
  assert.ok(scheduled.analysisCircleGrow.at >= scheduled.analysisZoomOut.at + 2.2);
  assert.ok(start >= scheduled.analysisLayout.at + scheduled.analysisLayout.duration);
  assert.notEqual(sampleMicro20(8, undefined, timing, undefined, undefined, 1).phase, 'issues');
  assert.equal(sampleMicro20(start, undefined, timing, undefined, undefined, 1).phase, 'issues');
});
test('effective duration covers late handoff, long travel/merges, issue hold, after-send typing and window exit', () => {
  assert.equal(micro20DurationFrames(), 526);
  assert.equal(micro20DurationFrames({issueStart: 10}), 572);
  const endpoint = sampleMicro20Frame(micro20DurationFrames() - 1);
  if (endpoint.phase !== 'issues') throw new Error('Expected final postlude frame');
  assert.equal(endpoint.issue.agent.phase, 'exited');
  const controls = {...MICRO_20_ISSUE_DEFAULTS, travelDuration: 10};
  const duration = micro20DurationFrames({issueControls: controls}) / 30;
  assert.ok(duration > 19);
  const final = sampleMicro20(duration, undefined, undefined, controls);
  assert.equal(final.phase, 'issues');
  if (final.phase === 'issues') assert.equal(final.issue.phase, 'end-hold');
  assert.equal(micro20DurationFrames({issueControls: {...controls, timelineDuration: 30}}), 1216);
  const timing = {...MICRO_20_ISSUE_TIMING, messageSend: {at: 15, duration: 2}, agentWindowExit: {at: 19, duration: 1}};
  const end = micro20DurationFrames({issueTiming: timing}) / 30;
  assert.ok(end >= 27.5);
  const last = sampleMicro20(end, undefined, undefined, undefined, timing);
  if (last.phase !== 'issues') throw new Error('Expected postlude');
  assert.equal(last.issue.agent.phase, 'exited');
  assert.equal(last.issue.agent.command, 'lmnr-cli sql query');
});
test('nonmonotonic seeks and nonfinite time inputs are deterministic', () => {
  for (const time of [7.5, 1.3, 6.4, 3.45, 14.5, 5.55, 0, 6.4]) {
    const a = sampleMicro20(time); sampleMicro20(20); sampleMicro20(0);
    assert.deepEqual(a, sampleMicro20(time));
  }
  for (const time of [-1, NaN, Infinity]) assert.equal(sampleMicro20(time).time, 0);
});

test('R02 incomplete zoom never discovers a warning beyond the actual visible circle', () => {
  for (const zoom of [.25, .5, .75, 1]) for (const radius of [0, 150, 400, 820]) for (const time of [7, 7.4]) {
    const controls = {...MICRO_20_DEFAULTS, radialCircleRadius: radius};
    const timing = {...PRELUDE_TIMING, analysisZoomOut: {...PRELUDE_TIMING.analysisZoomOut, to: {progress: zoom}}};
    const sample = prelude(time, controls, timing);
    for (const warning of sample.warnings) {
      const renderedDistance = Math.hypot(warning.x - sample.origin.x, warning.y - sample.origin.y);
      assert.ok(Math.abs(warning.distance - renderedDistance) < 1e-7);
      if (warning.scale > 0) assert.ok(renderedDistance <= sample.radius, `${warning.id}: ${renderedDistance} > ${sample.radius}`);
      if (warning.scale === 1) assert.ok(sample.radius >= renderedDistance + 35.1 - 1e-7);
    }
    assert.ok(Math.abs(sample.requiredRadius - Math.max(...sample.warnings.map(w => w.distance)) - 35.1) < 1e-7);
    assert.deepEqual(sample, sampleMicro20Frame(time * 30, controls, JSON.parse(JSON.stringify(timing))));
    if (zoom < 1) assert.notEqual(sample.phase, 'issues');
    if (zoom === .75 && radius === 150) assert.equal(sample.warnings.find(w => w.id === 'cell-169')!.scale, 0);
  }
});
