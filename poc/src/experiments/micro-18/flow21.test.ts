import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import imported from '../../../handoff/voiceover-retime/retimed-settings.json';
import {Flow2Graph} from '../introducing-flow-1-2/Scene';
import {createFlow2Sampler} from '../introducing-flow-1-2/sample';
import {FLOW_2_TIMELINE} from '../introducing-flow-1-2/timeline';
import {graphState, flow2WorldState} from '../introducing-flow-1-2/geometry';
import {BEAD_ORDER, beadProgress} from '../introducing-flow-1-2/beads';
import {ultimate3ScoreCues} from './score/cues';
import {flowTimelineConfig, flowTimelineSettings, liveFlowPreview} from './authoring';
import {FLOW_HOLD, VOICEOVER_DEFAULTS, readVoiceoverSettings, normalizeVoiceoverSettings, migrateStoredVoiceoverFlow21} from './voiceover-cut';
import {FLOW_21_TIMING, normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {chapterSchedule, flowNarrationRevealAt, sampleFlow, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {Ultimate3Scene} from './Scene';
import {sharedWorldCamera, flowCameraInSharedWorld, costCameraInSharedWorld} from './transitions';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const s = VOICEOVER_DEFAULTS;
const entryEnd = s.flow.entrySlide.at + s.flow.entrySlide.duration;
const start = chapterSchedule(s).find(chapter => chapter.id === 'flow')!.start;
const at = (native: number) => start + entryEnd + native;
const render = (time: number, settings = s) => renderToStaticMarkup(createElement(Ultimate3Scene, {settings, sample: sampleUltimate3(time, settings)}));

test('latest v4 selects Animation21 defaults while original-cut and historical JSON stay source13', () => {
  assert.equal(s.flow.sourceVersion, 21);
  // The voice cut holds the benchmark and the engine for its narration; everything before stays source21.
  assert.equal(s.flow.timing21!.beadsEntry.at, 2.88);
  close(s.flow.timing21!.graphSpread.at, 5.41 + 2.2);
  close(s.flow.timing21!.cameraToEngine.at, FLOW_21_TIMING.cameraToEngine.at + 2.4);
  close(s.pacing.flowTrimEnd, 11.3 + FLOW_HOLD);
  assert.equal(s.flow.timing21!.graphSpread.duration, 1.54);
  assert.equal(s.flow.controls.beadStaggerSeconds, .11);
  assert.equal(s.flow.controls.coverMotion, 'split');
  assert.equal(ultimate3DurationFrames(s), 2129);
  assert.deepEqual(s.flow.timing, normalizeSettings(imported).flow.timing, 'legacy audio schedule is retained, not retuned');
  assert.equal(ULTIMATE_3_DEFAULTS.flow.sourceVersion, undefined);
  assert.equal(sampleFlow(6, ULTIMATE_3_DEFAULTS).playback21, undefined);
  const legacyImport = normalizeVoiceoverSettings(imported);
  assert.equal(legacyImport.flow.sourceVersion, 13);
  assert.equal(readVoiceoverSettings({getItem: () => JSON.stringify(legacyImport)}).flow.sourceVersion, 13);
  assert.deepEqual(normalizeVoiceoverSettings(s), s);
});

test('storage-only source upgrade is idempotent and does not mutate other authored chapters or controls', () => {
  const old = structuredClone(s);
  delete old.flow.sourceVersion; delete old.flow.timing21;
  old.cost.timing.cameraDownToBudget.at = 8.9;
  old.flow.controls.coverMotion = 'right';
  old.flow.entrySlide.duration = 1.7;
  old.voiceover!.phrases.n08.at = 34.567;
  const before = structuredClone(old);
  const upgraded = migrateStoredVoiceoverFlow21(old) as typeof s;
  assert.deepEqual(old, before);
  assert.equal(upgraded.flow.sourceVersion, 21);
  for (const key of ['allocations','pacing','ultimate2','cost','issues','conclusion','voiceover','clouds'] as const) assert.deepEqual(upgraded[key], old[key]);
  assert.deepEqual(upgraded.flow.timing, old.flow.timing);
  assert.deepEqual(upgraded.flow.controls, old.flow.controls);
  assert.deepEqual(upgraded.flow.entrySlide, old.flow.entrySlide);
  assert.deepEqual(migrateStoredVoiceoverFlow21(upgraded), upgraded);
  assert.equal(readVoiceoverSettings({getItem: () => JSON.stringify(old)}).flow.sourceVersion, 21);
});

test('stitched graph reuses shared rendering with its narration cue and no between-statistics camera pan', () => {
  for (const native of [2.9, 3.5, 4.5, 5.2, 5.6, 6.5, 7.5, 8.97, 9.7, 11, 13.2]) {
    const sample = sampleUltimate3(at(native), s).flow!;
    const source = createFlow2Sampler({...FLOW_2_TIMELINE, ...s.flow.timing21}).sample(sample.nativeTime);
    source.progress.cloudReveal = 1;
    assert.deepEqual(sample.playback21, source);
    const graph = renderToStaticMarkup(createElement(Flow2Graph, {playback: source, beadStaggerSeconds: .11, flowRevealAt: flowNarrationRevealAt(s)}));
    assert.ok(render(at(native)).includes(graph));
  }
  const early = sampleFlow(entryEnd + 5.2, s).playback21!;
  const spread = sampleFlow(entryEnd + 9.7, s).playback21!;
  assert.deepEqual(flow2WorldState(early).camera, flow2WorldState(spread).camera);
  assert.equal(graphState(spread).ball.x, 1150); assert.equal(graphState(spread).ball.y, 270);
  const markup = render(at(9.7));
  assert.match(markup, /while analyzing 20 times more traces per dollar/);
  assert.doesNotMatch(markup, /At 2% of the cost/);
  assert.match(markup, /data-model="sol"[^>]*color:#808080/);
  assert.match(markup, />80%<\/span>/);
  assert.equal((markup.match(/class="flow1-subtitle-layer"/g) ?? []).length, 0, 'the voice cut draws only its script captions');
});

test('both shared-camera seams use source21 state, including its actual retimed engine endpoint', () => {
  const entering = sampleUltimate3(start, s).flow!;
  assert.deepEqual(sharedWorldCamera({entryProgress: 0, outgoingCostCamera: entering.outgoingCost.camera, flowPlayback: entering.playback, flowPlayback21: entering.playback21}), costCameraInSharedWorld(entering.outgoingCost.camera));
  for (const native of [0, 5.6, 6.5, 8.97, 11]) {
    const sample = sampleUltimate3(at(native), s).flow!;
    const expected = flowCameraInSharedWorld(flow2WorldState(sample.playback21!).camera);
    const actual = sharedWorldCamera({entryProgress: 1, outgoingCostCamera: sample.outgoingCost.camera, flowPlayback: sample.playback, flowPlayback21: sample.playback21});
    assert.deepEqual(actual, expected);
    const html = render(at(native));
    close(Number(html.match(/data-camera-y="([^"]+)"/)![1]), expected.y);
  }
  const retimed = normalizeSettings({...s, flow: {...s.flow, timing21: {...s.flow.timing21, cameraToEngine: {...s.flow.timing21!.cameraToEngine, at: 11}}}});
  const issueStart = chapterSchedule(retimed).find(chapter => chapter.id === 'issues')!.start;
  const endpoint = sampleFlow(retimed.allocations.flow, retimed).playback21!;
  const expected = flowCameraInSharedWorld(flow2WorldState(endpoint).camera);
  const markup = render(issueStart, retimed);
  close(Number(markup.match(/data-camera-y="([^"]+)"/)![1]), expected.y);
});

test('entry bridge converges on the authored source21 opening camera without a snap', () => {
  for (const key of ['cameraZoom', 'cameraToBenchmark', 'cameraToEngine'] as const) {
    const settings = normalizeSettings({...s, flow: {...s.flow, timing21: {...s.flow.timing21,
      [key]: {...s.flow.timing21![key], from: {progress: .5}},
    }}});
    const entering = sampleUltimate3(start, settings).flow!;
    const playback = sampleFlow(entryEnd, settings);
    const args = {outgoingCostCamera: entering.outgoingCost.camera, flowPlayback: playback.playback, flowPlayback21: playback.playback21};
    const arrival = sharedWorldCamera({...args, entryProgress: 1});
    assert.deepEqual(arrival, flowCameraInSharedWorld(flow2WorldState(playback.playback21!).camera));
    const nearArrival = sharedWorldCamera({...args, entryProgress: 1 - 1e-9});
    for (const axis of ['x', 'y', 'scale'] as const) assert.ok(Math.abs(nearArrival[axis] - arrival[axis]) < .0001, `${key}: ${axis} snaps`);
    assert.deepEqual(sharedWorldCamera({...args, entryProgress: 0}), costCameraInSharedWorld(entering.outgoingCost.camera));
    assert.equal(sampleFlow(entryEnd / 2, settings).nativeTime, 0);
  }
});

test('source21 authoring retains actual current values, custom endpoints and curves, and export parity', () => {
  const edited = normalizeVoiceoverSettings({...s, flow: {...s.flow, controls: {...s.flow.controls, beadStaggerSeconds: .2},
    timing21: {...s.flow.timing21, graphSpread: {at: 5, duration: 2, from: {progress: .2}, to: {progress: .8}, transition: {type: 'easing', duration: 2, ease: [0,0,1,1]}}}}});
  assert.equal(edited.flow.timing21!.graphSpread.from!.progress, .2);
  assert.equal(edited.flow.controls.beadStaggerSeconds, .2);
  const config = flowTimelineConfig(edited);
  const resolved = computeStaticTimeline(parseTimelineConfig(config), {});
  const local = entryEnd + 6;
  const live: any = {time: local, ...Object.fromEntries(resolved.clips.map(clip => [clip.key, {...clip, current: computeClipState(clip, local, local).current}]))};
  const preview = liveFlowPreview(live, edited).playback21!;
  const exported = sampleFlow(local, edited).playback21!;
  for (const key of Object.keys(exported.progress) as (keyof typeof exported.progress)[]) close(preview.progress[key], exported.progress[key]);
  close(preview.progress.graphSpread, .5);
  live.graphSpread.current.progress = .37;
  assert.equal(liveFlowPreview(live, edited).playback21!.progress.graphSpread, .37);
  assert.equal(flowTimelineSettings(edited).keys.filter(key => key.startsWith('bead')).length, 1);
  assert.ok(!flowTimelineSettings(edited).keys.includes('modelRows'));
  const times = [0, 3.1, 6.5, 9, 12];
  const states = times.map(time => sampleFlow(time, edited));
  [...times].reverse().forEach((time, index) => assert.deepEqual(sampleFlow(time, edited), states[states.length - 1 - index]));
});

test('bead drop cues land with the rendered beads, including clamped stagger gaps and the narrated flow-1 hold', () => {
  for (const beadStaggerSeconds of [0, .11, .5]) {
    const settings = normalizeSettings({...s, flow: {...s.flow, controls: {...s.flow.controls, beadStaggerSeconds}}});
    const flowStart = chapterSchedule(settings).find(item => item.id === 'flow')!.start;
    const progress = (time: number) => beadProgress(sampleFlow(time - flowStart, settings).playback21!, beadStaggerSeconds, flowNarrationRevealAt(settings));
    ultimate3ScoreCues(settings).flow.numberDrops.forEach((drop, i) => {
      close(progress(drop)[BEAD_ORDER[i]], 1);
      assert.ok(progress(drop - .01)[BEAD_ORDER[i]] < 1, `stagger ${beadStaggerSeconds}: bead ${i} is still travelling before its drop`);
    });
  }
});
