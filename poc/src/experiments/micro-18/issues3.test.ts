import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sampleMicro20, sampleMicro20Frame} from '../micro-20/sample';
import {micro20PostludeDurationFrames} from '../micro-20/timeline';
import {NARRATION} from '../micro-20/narration';
import {introducingFlowState} from '../introducing-flow-1/geometry';
import {chapterSchedule, issueHandoffValidation, sampleFlow, sampleIssues, sampleUltimate3, ultimate3Duration, ultimate3DurationFrames} from './sample';
import {issueEndpoint, issueEntryEnd, issuePostludeOffset, issuePreludeEnd, normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {flowCameraInSharedWorld, flowCloudScreenTransform, flowIssuesCamera, issueOpeningCamera, issueSurfacePlacement, projectScreenRect, projectWorldPoint} from './transitions';
import {issuesTimelineConfig, settingsFromIssuesTimeline} from './authoring';
import {ultimate3AgentWindowSoundTiming} from './sound';
import {ultimate3TypingTickEvents} from './typing-audio';
import {Ultimate3Scene} from './Scene';

const settings = normalizeSettings(ULTIMATE_3_DEFAULTS);
const close = (a: number, b: number, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const sameSample = (actual: any, expected: any, path = 'sample') => {
  if (typeof actual === 'number' && typeof expected === 'number') {
    assert.ok(Math.abs(actual - expected) < 1e-7, `${path}: ${actual} != ${expected}`);
  } else if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
    for (const key of Object.keys(actual)) sameSample(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
};
const numericJSON = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'number' ? Math.round(v * 1e8) / 1e8 : v);

test('full 465-frame source20 chapter follows 1.2s entry and pushes conclusion, not previous chapters', () => {
  const schedule = chapterSchedule(settings);
  close(issuePreludeEnd(settings), 8.45);
  assert.equal(micro20PostludeDurationFrames(), 465);
  assert.equal(issueEndpoint(settings), 15.5);
  assert.equal(schedule[3].label, '20 Issue clusters 3');
  assert.equal(schedule[3].duration, 16.7);
  close(schedule[3].start, 42.518181818181816);
  close(schedule[4].start, 59.21818181818182);
  close(ultimate3Duration(settings), 63.21818181818182);
  assert.equal(ultimate3DurationFrames(settings), 1897);
  assert.deepEqual(schedule.slice(0, 3).map(s => s.duration), [ULTIMATE_3_DEFAULTS.allocations.ultimate2, 15, 13]);
});

test('every source20 native frame matches standalone including reverse/random seeks and all narration', () => {
  const start = chapterSchedule(settings)[3].start + issueEntryEnd(settings);
  const frames = Array.from({length: 465}, (_, frame) => frame);
  const forward = frames.map(frame => sampleUltimate3(start + frame / 30, settings).issues!);
  for (let index = frames.length - 1; index >= 0; index--) {
    const sample = sampleUltimate3(start + frames[index] / 30, settings).issues!;
    assert.deepEqual(sample, forward[index]);
    sameSample(sample.source20, sampleMicro20Frame(frames[index]));
    if (sample.postludeActive) assert.deepEqual(sample.sample, sample.source20.issue);
  }
  for (const [time, key] of [[1, 'flow'], [4, 'scale'], [6, 'detection'], [8, 'everyTrace'], [10, 'patterns'], [13, 'ready']] as const) {
    const sample = sampleUltimate3(start + time, settings);
    assert.equal(sample.issues!.source20.narration, key);
    const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample, settings}));
    assert.ok(html.includes(NARRATION[key]));
    assert.equal((html.match(/class="micro20-subtitle"/g) ?? []).length, 1);
    assert.ok(html.lastIndexOf('micro20-subtitle-layer') > html.lastIndexOf('data-native-time'));
  }
});

test('one downward camera starts at real Flow pose and lands on exact source20 opening; one lattice, no cards', () => {
  for (const trim of [0, 8, 10, 11.8, 15]) {
    const s = normalizeSettings({...settings, pacing: {...settings.pacing, flowTrimEnd: trim}});
    const outgoing = flowCameraInSharedWorld(introducingFlowState(sampleFlow(s.allocations.flow, s).playback).camera);
    const placement = issueSurfacePlacement(outgoing), incoming = issueOpeningCamera(placement);
    assert.deepEqual(flowIssuesCamera(outgoing, 0), outgoing);
    const end = flowIssuesCamera(outgoing, 1);
    close(end.x, incoming.x); close(end.y, incoming.y); close(end.scale, incoming.scale);
    assert.ok(projectWorldPoint(placement, outgoing).y > 720, 'incoming section is below outgoing viewport');
    let previousY = Infinity;
    for (const p of [0, .1, .25, .5, .75, .9, 1]) {
      const camera = flowIssuesCamera(outgoing, p), top = projectWorldPoint(placement, camera);
      assert.ok(top.y < previousY, 'surface moves up as camera descends'); previousY = top.y;
    }
    for (const point of [{x: 0, y: 0}, {x: 640, y: 360}, {x: 1280, y: 720}]) {
      const screen = projectWorldPoint({x: placement.x + point.x * placement.scale, y: placement.y + point.y * placement.scale}, incoming);
      close(screen.x, point.x); close(screen.y, point.y);
    }
    // Source20 local stroke centers and shared 100-unit grid share a phase.
    close((placement.x + -19.5 * placement.scale) % 100, 0);
    close((placement.y + 60.5 * placement.scale) % 100, 0);
  }
  const sample = sampleUltimate3(chapterSchedule(settings)[3].start + .6, settings);
  const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample, settings}));
  assert.equal((html.match(/data-shared-camera="true"/g) ?? []).length, 1);
  assert.equal((html.match(/class="micro18-shared-grid"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /TODO: transition|class="flow1-subtitle|class="micro20-subtitle"/);
  assert.equal(sample.issues!.nativeTime, 0);
});

test('retimed, held, instant and endpoint-normalized entry seeks are deterministic', () => {
  for (const duration of [0, .4, 2]) {
    const s = normalizeSettings({...settings, issues: {...settings.issues, leadIn: {at: .25, duration,
      from: {progress: .2}, to: {progress: .8}, transition: {type: 'easing', duration, ease: [0, 0, 1, 1]}}}});
    const end = issueEntryEnd(s);
    assert.equal(sampleIssues(.249, s).entryProgress, 0);
    assert.equal(sampleIssues(end, s).entryProgress, 1);
    assert.equal(sampleIssues(end, s).nativeTime, 0);
    if (duration) close(sampleIssues(.25 + duration / 2, s).entryProgress, .5);
    for (const time of [end + 3, end, .249, end + 1, 0]) assert.deepEqual(sampleIssues(time, s), sampleIssues(time, s));
    assert.equal(numericJSON(sampleIssues(end + 3, s).source20), numericJSON(sampleMicro20(3)));
  }
  for (const value of [NaN, Infinity, -10]) assert.equal(sampleUltimate3(value, settings).time, 0);
});

test('prelude dependencies ripple postlude bars, full duration, sounds and typing together', () => {
  const config: any = issuesTimelineConfig(settings);
  config.prelude_bashDescent.duration += 3;
  const s = settingsFromIssuesTimeline(config, settings);
  assert.ok(issuePreludeEnd(s) > issuePreludeEnd(settings));
  assert.deepEqual(s.issues.timing, settings.issues.timing, 'postlude native seconds do not move');
  assert.ok(issueEndpoint(s) > issueEndpoint(settings));
  const configAfter: any = issuesTimelineConfig(s);
  close(configAfter.postlude_promptTyping.at, issuePostludeOffset(s) + s.issues.timing.promptTyping.at);
  for (const state of [settings, s]) {
    const start = chapterSchedule(state)[3].start;
    const offset = start + issuePostludeOffset(state);
    const sounds = ultimate3AgentWindowSoundTiming(state);
    assert.ok(sounds);
    close(sounds.down.at, offset + state.issues.timing.agentWindowEnter.at);
    for (const event of ultimate3TypingTickEvents(state)) {
      const playback = sampleUltimate3(event.time, state).issues!;
      assert.ok(playback.postludeActive);
      close(playback.source20.time - playback.source20.issueStart, event.time - offset);
    }
  }
});

test('one full authoring preset can retime entry, prelude and postlude together without losing imported bars', () => {
  const imported = normalizeSettings({...settings, issues: {...settings.issues,
    leadIn: {...settings.issues.leadIn, duration: 2},
    preludeTiming: {...settings.issues.preludeTiming, bashDescent: {...settings.issues.preludeTiming.bashDescent, duration: 3}},
    timing: {...settings.issues.timing, promptTyping: {...settings.issues.timing.promptTyping, at: 6, duration: .9}},
  }});
  const actual = settingsFromIssuesTimeline(issuesTimelineConfig(imported), settings);
  assert.deepEqual(actual.issues, imported.issues);
});

test('editing a prelude duration and postlude endpoints together ripples unchanged postlude starts', () => {
  const config: any = issuesTimelineConfig(settings);
  config.prelude_bashDescent.duration = 3.69;
  config.postlude_subtitleReady.from = {progress: .27};
  config.postlude_subtitleReady.to = {progress: .83};
  const actual = settingsFromIssuesTimeline(config, settings);
  assert.equal(actual.issues.timing.subtitleReady.at, settings.issues.timing.subtitleReady.at);
  assert.equal(actual.issues.timing.subtitleReady.from?.progress, .27);
  assert.ok(issuePostludeOffset(actual) > issuePostludeOffset(settings));
});

test('early-trim Flow clouds stay on the outgoing world plane until it leaves the viewport', () => {
  const s = normalizeSettings({...settings, pacing: {...settings.pacing, flowTrimEnd: 0}});
  const start = chapterSchedule(s)[3].start;
  const before = sampleUltimate3(start - 1e-6, s);
  const flowState = introducingFlowState(before.flow!.playback);
  assert.equal(before.flow!.playback.progress.cloudExit, 0);
  assert.equal(before.flow!.playback.progress.cloudReveal, 1);
  const outgoing = flowCameraInSharedWorld(flowState.camera);
  const plane = {x: 0, y: 0, width: 1280, height: 720};
  const boundary = flowCloudScreenTransform(0, flowIssuesCamera(outgoing, 0), outgoing);
  assert.deepEqual(boundary, {x: 0, y: 0, scale: 1});
  for (const time of [start - 1e-6, start, start + .01]) {
    const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample: sampleUltimate3(time, s), settings: s}));
    assert.match(html, /class="micro18-flow-cloud-layer"/);
    if (time >= start) assert.match(html, /data-cloud-attachment="outgoing-world"/);
  }
  const midpoint = flowCloudScreenTransform(0, flowIssuesCamera(outgoing, .5), outgoing);
  assert.ok(projectScreenRect(plane, midpoint).y < 0, 'outgoing clouds travel up with the outgoing surface');
  const arrived = flowCloudScreenTransform(0, flowIssuesCamera(outgoing, 1), outgoing);
  const bounds = projectScreenRect(plane, arrived);
  assert.ok(bounds.y + bounds.height < 0, 'cloud canvas is fully offscreen before removal');
  const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample: sampleUltimate3(start + issueEntryEnd(s), s), settings: s}));
  assert.doesNotMatch(html, /class="micro18-flow-cloud-layer"/);
});

test('blocked source20 handoffs expose native diagnostics and suppress postlude-only audio', () => {
  assert.equal(issueHandoffValidation(settings), null);
  const invalid = [
    normalizeSettings({...settings, issues: {...settings.issues,
      preludeControls: {...settings.issues.preludeControls, radialCircleRadius: 0}}}),
    normalizeSettings({...settings, issues: {...settings.issues,
      preludeTiming: {...settings.issues.preludeTiming,
        analysisLayout: {...settings.issues.preludeTiming.analysisLayout, to: {progress: .5}}}}}),
  ];
  for (const s of invalid) {
    const source = sampleMicro20(issuePreludeEnd(s), s.issues.preludeControls, s.issues.preludeTiming,
      s.issues.controls, s.issues.timing, s.issues.issueStart);
    assert.ok(issueHandoffValidation(s));
    assert.equal(issueHandoffValidation(s), source.validation);
    assert.deepEqual(ultimate3TypingTickEvents(s), []);
    assert.equal(ultimate3AgentWindowSoundTiming(s), undefined);
    for (const time of [issuePostludeOffset(s), issueEntryEnd(s) + issueEndpoint(s)]) {
      assert.equal(sampleIssues(time, s).postludeActive, false);
    }
  }
});
