import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Ultimate3Scene} from './Scene';
import {sampleMicro16} from '../micro-16/sample';
import {flow2WorldState} from '../introducing-flow-1-2/geometry';
import {chapterSchedule, sampleFlow, sampleUltimate3} from './sample';
import {costEndpoint, normalizeSettings, ULTIMATE_3_DEFAULTS, type Ultimate3Settings} from './settings';
import {VOICEOVER_DEFAULTS} from './voiceover-cut';
import {CANONICAL_GRID, FLOW_PLACEMENT, costCameraInSharedWorld, flowCameraInSharedWorld, issueSurfacePlacement, projectWorldPoint, sharedWorldCamera} from './transitions';

const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const costCamera = (s: Ultimate3Settings) => sampleMicro16(costEndpoint(s), s.cost.controls, s.cost.timing).camera;
function cameraAt(time: number, s: Ultimate3Settings) {
  const flow = sampleFlow(time, s);
  return sharedWorldCamera({entryProgress: flow.entryProgress, outgoingCostCamera: costCamera(s),
    flowPlayback: flow.playback, flowPlayback21: flow.playback21, flowLayout: flow.worldLayout});
}

test('current Cost-to-Flow bridge holds horizontal viewport center while descending and zooming', () => {
  const s = VOICEOVER_DEFAULTS;
  const start = costCameraInSharedWorld(costCamera(s));
  const centerX = (640 - start.x) / start.scale;
  const end = s.flow.entrySlide.at + s.flow.entrySlide.duration;
  let previousY = (360 - start.y) / start.scale;
  for (let frame = 0; frame <= 60; frame++) {
    const c = cameraAt(end * frame / 60, s);
    close((640 - c.x) / c.scale, centerX);
    const y = (360 - c.y) / c.scale;
    assert.ok(y >= previousY - 1e-7);
    previousY = y;
  }
  assert.ok(previousY > (360 - start.y) / start.scale + 100);
  close(cameraAt(0, s).scale, 1.2);
  close(cameraAt(end, s).scale, 1);
});

// The quicker budget drain stops Cost's camera sooner along the run, so Flow snaps six cells over.
test('layout shifts six whole cells; settled Flow framing and downstream grid alignment stay intact', () => {
  const flow = sampleFlow(VOICEOVER_DEFAULTS.allocations.flow, VOICEOVER_DEFAULTS);
  const layout = flow.worldLayout!;
  assert.equal(layout.placement.x, FLOW_PLACEMENT.x - 6 * CANONICAL_GRID.pitch);
  assert.equal(layout.placement.y, FLOW_PLACEMENT.y);
  close(layout.placement.x % CANONICAL_GRID.pitch, 0);
  const state = flow2WorldState(flow.playback21!);
  const before = flowCameraInSharedWorld(state.camera);
  const after = flowCameraInSharedWorld(state.camera, layout, flow.playback21);
  for (const p of [{x: 0, y: 0}, {x: 640, y: 360}, {x: 1150, y: 1700}]) {
    const a = projectWorldPoint({x: p.x + FLOW_PLACEMENT.x, y: p.y + FLOW_PLACEMENT.y}, before);
    const b = projectWorldPoint({x: p.x + layout.placement.x, y: p.y + layout.placement.y}, after);
    close(a.x, b.x); close(a.y, b.y);
  }
  close(issueSurfacePlacement(after).x, issueSurfacePlacement(before).x - 600);
  close(issueSurfacePlacement(after).y, issueSurfacePlacement(before).y);
});

test('bridge arrival is continuous and alignment is deterministic under retiming and authored camera starts', () => {
  const s = normalizeSettings({...VOICEOVER_DEFAULTS, flow: {...VOICEOVER_DEFAULTS.flow,
    entrySlide: {at: .2, duration: 2, transition: {type: 'easing', duration: 2, ease: [.2, 0, .55, .2]}},
    timing21: {...VOICEOVER_DEFAULTS.flow.timing21, cameraZoom: {...VOICEOVER_DEFAULTS.flow.timing21!.cameraZoom,
      from: {progress: .35}, to: {progress: 1}}}}});
  const outgoing = costCameraInSharedWorld(costCamera(s));
  const times = [0, .2, .6, 1, 2, 2.2];
  const forward = times.map(t => cameraAt(t, s));
  [...times].reverse().forEach((t, i) => assert.deepEqual(cameraAt(t, s), forward[forward.length - 1 - i]));
  forward.forEach(c => close((640 - c.x) / c.scale, (640 - outgoing.x) / outgoing.scale));
  const before = cameraAt(2.2 - 1e-9, s), arrival = cameraAt(2.2, s), after = cameraAt(2.2 + 1e-9, s);
  for (const key of ['x', 'y', 'scale'] as const) {close(before[key], arrival[key], 1e-5); close(after[key], arrival[key], 1e-5);}
});

test('alignment follows live authored camera progress rather than resampling a default clock', () => {
  const flow = sampleFlow(0, VOICEOVER_DEFAULTS);
  const live = {...flow.playback21!, progress: {...flow.playback21!.progress, cameraZoom: .5}};
  const state = flow2WorldState(live);
  const aligned = flowCameraInSharedWorld(state.camera, flow.worldLayout, live);
  const layout = flow.worldLayout!;
  close(aligned.x - (state.camera.x - layout.placement.x * state.camera.scale),
    layout.openingCenterOffset * state.camera.scale * .5);
});

test('actual scene uses the aligned camera, content placement and world-attached cloud plane', () => {
  const s = VOICEOVER_DEFAULTS, start = chapterSchedule(s)[2].start;
  for (const local of [0, .3, .6, s.flow.entrySlide.at + s.flow.entrySlide.duration]) {
    const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample: sampleUltimate3(start + local, s), settings: s}));
    const expected = cameraAt(local, s);
    for (const key of ['x', 'y', 'scale'] as const) close(Number(html.match(new RegExp(`data-camera-${key}="([^"]+)"`))![1]), expected[key]);
    assert.match(html, /data-world-x="600" data-world-y="4800"/);
    assert.equal((html.match(/class="micro09-clouds"/g) ?? []).length, 1);
  }
});

test('historical cut keeps its original world placement and camera trajectory', () => {
  for (const time of [0, .3, 1, 2, 6]) {
    const flow = sampleFlow(time, ULTIMATE_3_DEFAULTS);
    assert.equal(flow.worldLayout, undefined);
    assert.deepEqual(cameraAt(time, ULTIMATE_3_DEFAULTS), sharedWorldCamera({entryProgress: flow.entryProgress,
      outgoingCostCamera: costCamera(ULTIMATE_3_DEFAULTS), flowPlayback: flow.playback}));
  }
});
