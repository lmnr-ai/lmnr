import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Ultimate3Scene} from './Scene';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {VOICEOVER_DEFAULTS as settings, normalizeVoiceoverSettings, readVoiceoverSettings, CADENCE_TRIM, BRISK_TRIM} from './voiceover-cut';
import {normalizeSettings, ULTIMATE_3_DEFAULTS, type Flow21Timing} from './settings';
import {chapterSchedule, sampleFlow, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {flowTimelineConfig, flowTimelineSettings, liveFlowPreview, settingsFromFlowTimeline} from './authoring';
import {COMPARISON_KEYS, REPLACED_GRAPH_KEYS, comparisonDefaults, flowComparisonArrival, withFlowComparison} from './flow-comparison';
import {flow2WorldState} from '../introducing-flow-1-2/geometry';
import {flowCameraInSharedWorld} from './transitions';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
// Keep the authored comparison's relative beats while moving with upstream cadence.
const fromV9 = (time: number) => time - CADENCE_TRIM - BRISK_TRIM;
const offset = chapterSchedule(settings)[2].start + settings.flow.entrySlide.at + settings.flow.entrySlide.duration;
const comparison = settings.flow.comparison!;
assert.ok(comparison);
function liveAt(global: number, s = settings) {
  const config = flowTimelineConfig(s), time = global - chapterSchedule(s)[2].start;
  const resolved = computeStaticTimeline(parseTimelineConfig(config), {});
  return {time, ...Object.fromEntries(resolved.clips.map(clip => [clip.key, {...clip, current: computeClipState(clip, time, time).current}]))} as any;
}

test('visual replacement leaves every chapter, speech cue and engine beat at its original time', () => {
  assert.deepEqual(chapterSchedule(settings).map(({start, end}) => [start, end]), [[0,19.06],[19.06,28.43],[28.43,43.622],[43.622,62.93],[62.93,69.48]]);
  assert.equal(ultimate3DurationFrames(settings), 2085);
  close(settings.voiceover!.phrases.n13.at, fromV9(43.73));
  assert.equal(settings.voiceover!.phrases.n13.duration, 2.75);
  for (const [key, global] of Object.entries({cameraToEngine:47.1,moduleActivation:47.66,engineSpinner:47.81,engineLines:47.81,coverDescent:48.23,coverTint:48.57,coverSpinner:48.62})) close(offset + settings.flow.timing21![key as keyof Flow21Timing].at, fromV9(global));
  close(offset + comparison.timing.comparisonExit.at, fromV9(43.44));
  close(offset + comparison.timing.comparison_gridShrink.at, fromV9(43.73));
  close(offset + comparison.timing.comparison_returnToGrid.at, fromV9(46.5));
  close(offset + comparison.timing.comparison_returnToGrid.at + comparison.timing.comparison_returnToGrid.duration, fromV9(47.76));
});

test('one native timeline exposes replacement bars and retains original engine controls', () => {
  const keys = flowTimelineSettings(settings).keys;
  COMPARISON_KEYS.forEach(key => assert.ok(keys.includes(key)));
  REPLACED_GRAPH_KEYS.forEach(key => assert.ok(!keys.includes(key)));
  assert.ok(!keys.includes('cameraToEngine'), 'the return bar owns the single combined camera move');
  assert.ok(keys.includes('beadsEntry'));
  const live = liveAt(fromV9(45));
  const next = settingsFromFlowTimeline(live, settings);
  assert.deepEqual(next.flow.timing21, settings.flow.timing21, 'hidden old timing survives for historical audio/export metadata');
  close(next.flow.comparison && next.flow.comparison.timing.comparison_gridShrink.at || 0, comparison.timing.comparison_gridShrink.at);
});

test('retained live current values and edited mask timings match static export and reverse samples', () => {
  const live = liveAt(fromV9(45));
  live.comparison_gptNumber.at = 12;
  live.comparison_gptNumber.current.progress = .25;
  live.comparison_blueDots.duration = .2;
  live.comparison_blueDots.transition = {type:'easing', duration:.2, ease:[0,0,1,1]};
  const preview = liveFlowPreview(live, settings).comparison!;
  assert.equal(preview.sample.numberContainersVisible.gpt, false);
  assert.equal(preview.sample.numbers.gpt, 10);
  assert.equal(preview.sample.dotDurations.blue, .2);
  for (const global of [40,43.44,43.73,44.5,45.9,46.8,47.1,49].map(fromV9)) {
    const timeline = liveAt(global);
    const authored = settingsFromFlowTimeline(timeline, settings);
    const actual = liveFlowPreview(timeline, authored).comparison!;
    const exported = sampleFlow(timeline.time, authored).comparison!;
    for (const key of Object.keys(exported.sample.progress) as (keyof typeof exported.sample.progress)[]) close(actual.sample.progress[key], exported.sample.progress[key]);
  }
  const times = [40,43.44,43.73,45,46.8,47.1,49].map(fromV9);
  const frames = times.map(t => sampleUltimate3(t, settings));
  [...times].reverse().forEach((t, i) => assert.deepEqual(sampleUltimate3(t, settings), frames[frames.length - 1 - i]));
});

test('load-only upgrade preserves custom timings, audio, original cuts and explicit imports', () => {
  const old = structuredClone(settings); delete old.flow.comparison;
  old.flow.timing21!.graphSpread.at = 7.9;
  old.flow.timing21!.beadsEntry.at = 3.123;
  const original = structuredClone(old);
  const migrated = withFlowComparison(old);
  assert.deepEqual(old, original);
  assert.deepEqual(migrated.flow.timing21, old.flow.timing21);
  for (const key of ['allocations','pacing','voiceover','ultimate2','cost','issues','conclusion','clouds'] as const) assert.deepEqual(migrated[key], old[key]);
  assert.deepEqual(withFlowComparison(migrated), migrated);
  assert.ok(migrated.flow.comparison);
  close(migrated.flow.comparison.timing.comparison_gridShrink.at, 7.96);
  assert.ok(readVoiceoverSettings({getItem: () => JSON.stringify(old)}).flow.comparison);
  const literal = normalizeVoiceoverSettings(old);
  assert.equal(literal.flow.comparison, false);
  assert.equal(readVoiceoverSettings({getItem: () => JSON.stringify(literal)}).flow.comparison, false);
  assert.deepEqual(withFlowComparison(ULTIMATE_3_DEFAULTS), ULTIMATE_3_DEFAULTS);
});

test('one camera continuously zooms and descends into Signals, with an exact native endpoint', () => {
  const f = sampleFlow(fromV9(46.5) - chapterSchedule(settings)[2].start, settings);
  const cameraAt = (p: number) => {
    const playback = {...f.playback21!, progress: {...f.playback21!.progress, cameraToEngine: p}};
    return flowCameraInSharedWorld(flow2WorldState(playback).camera, f.worldLayout, playback);
  };
  const begin = cameraAt(0), end = cameraAt(1);
  const start = flowComparisonArrival(begin, end, 0);
  close(start.camera.scale, .2);
  assert.ok(start.camera.y + (f.worldLayout!.placement.y + 3600) * start.camera.scale >= 720, 'engine starts below the viewport');
  assert.deepEqual(flowComparisonArrival(begin, end, 1).camera, end);
  let previous = start.camera;
  for (const t of [46.55,46.75,46.95,46.99,47.05,47.15,47.35,47.55,47.75].map(fromV9)) {
    const c = sampleFlow(t - chapterSchedule(settings)[2].start, settings).comparison!;
    const arrival = flowComparisonArrival(begin, end, c.sample.progress.returnToGrid);
    assert.ok(arrival.camera.scale > previous.scale, `zoom never stops at ${t}`);
    assert.ok(arrival.camera.y < previous.y, `descent never stops at ${t}`);
    previous = arrival.camera;
  }
});

test('delayed native return holds the benchmark through the old camera start, with live/export parity', () => {
  const edited = structuredClone(settings);
  assert.ok(edited.flow.comparison);
  edited.flow.comparison.timing.comparison_returnToGrid.at += .8; // 40.87s after the upstream cadence trims
  const camera = (html: string) => Object.fromEntries(['x','y','scale'].map(key => [key, Number(html.match(new RegExp(`data-camera-${key}="([^"]+)"`))![1])]));
  let held: Record<string, number> | undefined;
  for (const global of [46.5,47.09,47.11,47.29,47.3,47.31,47.8,48.56].map(fromV9)) {
    const sample = sampleUltimate3(global, edited);
    const exported = camera(renderToStaticMarkup(createElement(Ultimate3Scene, {settings: edited, sample})));
    const live = {...sample, flow: {...sample.flow!, ...liveFlowPreview(liveAt(global, edited), edited)}};
    const preview = camera(renderToStaticMarkup(createElement(Ultimate3Scene, {settings: edited, sample: live})));
    for (const key of ['x','y','scale']) close(preview[key], exported[key]);
    if (global < fromV9(47.3)) {
      held ??= exported;
      assert.deepEqual(exported, held, `legacy camera must stay frozen at ${global}`);
    }
  }
});

test('load-only v2 camera upgrade changes only the former default return, preserving custom clips and imports', () => {
  const legacy = structuredClone(settings);
  legacy.flow.comparison = comparisonDefaults(legacy.flow.timing21!, 1);
  const snapshot = structuredClone(legacy);
  const upgraded = withFlowComparison(legacy);
  assert.deepEqual(legacy, snapshot);
  assert.deepEqual(upgraded.flow.comparison, comparison);
  legacy.flow.comparison.timing.comparison_returnToGrid.duration = .9;
  const custom = withFlowComparison(legacy).flow.comparison;
  assert.ok(custom);
  assert.equal(custom.version, 2);
  assert.deepEqual(custom.timing, legacy.flow.comparison.timing);
  assert.equal(normalizeVoiceoverSettings(legacy).flow.comparison && (normalizeVoiceoverSettings(legacy).flow.comparison as typeof comparison).version, 1);
});

test('custom from/to, spring and instant semantics survive settings/export', () => {
  const timing = {...comparison.timing,
    comparison_gptNumber: {...comparison.timing.comparison_gptNumber, from:{progress:.2}, to:{progress:.8}, transition:{type:'spring' as const, stiffness:150,damping:25}},
    comparison_flowNumber: {...comparison.timing.comparison_flowNumber, duration:0, transition:{type:'instant' as const}},
  };
  const edited = normalizeSettings({...settings,flow:{...settings.flow,comparison:{version:1,timing}}});
  assert.ok(edited.flow.comparison);
  assert.deepEqual(edited.flow.comparison.timing.comparison_gptNumber.from,{progress:.2});
  const at = edited.flow.comparison.timing.comparison_flowNumber.at;
  assert.equal(sampleFlow(settings.flow.entrySlide.duration+at-.001,edited).comparison!.sample.numbers.flow,0);
  assert.equal(sampleFlow(settings.flow.entrySlide.duration+at+.001,edited).comparison!.sample.numbers.flow,888);
});
