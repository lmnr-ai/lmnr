import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {sampleMicro16} from '../micro-16/sample';
import {interpolateCloudRects} from '../micro-09/geometry';
import {introducingFlowState} from '../introducing-flow-1/geometry';
import {sampleFlow} from './sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {
  CANONICAL_GRID,
  COST_NATIVE_TO_WORLD,
  FLOW_PLACEMENT,
  costCameraInSharedWorld,
  costPointToWorld,
  flowCameraInSharedWorld,
  flowCloudScreenTransform,
  flowPointToWorld,
  projectScreenRect,
  projectWorldPoint,
  sharedWorldCamera,
} from './transitions';

const close = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);

const endpoint = sampleMicro16(15).camera;
const flowOpeningPlayback = sampleFlow(1.2, ULTIMATE_3_DEFAULTS).playback;

test('one fixed 100-unit lattice converts Cost native grid and fixes both content groups', () => {
  assert.equal(CANONICAL_GRID.pitch, 100);
  close(COST_NATIVE_TO_WORLD.scale, 5 / 6);
  for (const k of [-8, 0, 7, 31]) {
    close(costPointToWorld({x: -19.5 + 120 * k, y: 60.5 + 120 * k}).x, 100 * k);
    close(costPointToWorld({x: -19.5 + 120 * k, y: 60.5 + 120 * k}).y, 100 * k);
  }
  assert.deepEqual(flowPointToWorld({x: 0, y: 0}), FLOW_PLACEMENT);
  const costAnchor = costPointToWorld({x: 640, y: 4561});
  const flowAnchor = flowPointToWorld({x: 426, y: 211});
  for (const p of [0, .1, .5, .9, 1]) {
    assert.deepEqual(costPointToWorld({x: 640, y: 4561}), costAnchor, `Cost anchor moved at ${p}`);
    assert.deepEqual(flowPointToWorld({x: 426, y: 211}), flowAnchor, `Flow anchor moved at ${p}`);
  }
});

test('shared camera exactly reproduces Cost endpoint and Flow opening projections', () => {
  const outgoing = costCameraInSharedWorld(endpoint);
  for (const point of [{x: -19.5, y: 60.5}, {x: 640, y: 4561}, {x: 1874.2, y: 4561}]) {
    const projected = projectWorldPoint(costPointToWorld(point), outgoing);
    close(projected.x, point.x - endpoint.x, 1e-8);
    close(projected.y, point.y - endpoint.y, 1e-8);
  }
  const sourceOpening = introducingFlowState(flowOpeningPlayback).camera;
  const incoming = flowCameraInSharedWorld(sourceOpening);
  for (const point of [{x: 0, y: 0}, {x: 426, y: 211}, {x: 1074, y: 449}]) {
    const projected = projectWorldPoint(flowPointToWorld(point), incoming);
    close(projected.x, sourceOpening.x + point.x * sourceOpening.scale);
    close(projected.y, sourceOpening.y + point.y * sourceOpening.scale);
  }
});

test('the Cost-to-Flow bridge moves vertically on the canonical grid', () => {
  const outgoing = costCameraInSharedWorld(endpoint);
  const opening = flowCameraInSharedWorld(introducingFlowState(flowOpeningPlayback).camera);
  assert.equal(FLOW_PLACEMENT.x, 12 * CANONICAL_GRID.pitch, 'Flow placement must move by whole grid cells');
  assert.ok(Math.abs(opening.x - outgoing.x) <= CANONICAL_GRID.pitch,
    `bridge horizontal travel ${opening.x - outgoing.x} exceeds one grid unit`);
  assert.ok(Math.abs(opening.y - outgoing.y) > CANONICAL_GRID.pitch, 'bridge must retain its vertical descent');
});

test('the sole camera is continuous across bridge and then exactly composes every Flow camera move', () => {
  const outgoing = costCameraInSharedWorld(endpoint);
  const opening = flowCameraInSharedWorld(introducingFlowState(flowOpeningPlayback).camera);
  assert.deepEqual(sharedWorldCamera({entryProgress: 0, outgoingCostCamera: endpoint, flowPlayback: flowOpeningPlayback}), outgoing);
  assert.deepEqual(sharedWorldCamera({entryProgress: 1, outgoingCostCamera: endpoint, flowPlayback: flowOpeningPlayback}), opening);
  for (const p of [0, .01, .25, .5, .75, .99, 1]) {
    const camera = sharedWorldCamera({entryProgress: p, outgoingCostCamera: endpoint, flowPlayback: flowOpeningPlayback});
    close(camera.x, outgoing.x + (opening.x - outgoing.x) * p);
    close(camera.y, outgoing.y + (opening.y - outgoing.y) * p);
    close(camera.scale, outgoing.scale + (opening.scale - outgoing.scale) * p);
  }
  for (const nativeTime of [0, 2.5, 3.5, 6.5, 9.5, 11.8]) {
    const flow = sampleFlow(1.2 + nativeTime, ULTIMATE_3_DEFAULTS);
    assert.deepEqual(sharedWorldCamera({entryProgress: 1, outgoingCostCamera: endpoint, flowPlayback: flow.playback}),
      flowCameraInSharedWorld(introducingFlowState(flow.playback).camera));
  }
});

test('settled Flow clouds ride the opening world into view and hand off exactly to the native screen layer', () => {
  const opening = flowCameraInSharedWorld(introducingFlowState(flowOpeningPlayback).camera);
  const settledClouds = interpolateCloudRects(1, ULTIMATE_3_DEFAULTS.flow.controls.cloudYOffset);
  const outgoing = costCameraInSharedWorld(endpoint);
  const startTransform = flowCloudScreenTransform(0, outgoing, opening);
  const startRects = settledClouds.map(rect => projectScreenRect(rect, startTransform));
  assert.ok(startRects.every(rect => rect.y >= 720 || rect.y + rect.height <= 0 || rect.x >= 1280 || rect.x + rect.width <= 0),
    'incoming settled clouds must be outside the authored viewport at bridge start');

  for (const p of [0, .1, .5, .9, .999999]) {
    const camera = sharedWorldCamera({entryProgress: p, outgoingCostCamera: endpoint, flowPlayback: flowOpeningPlayback});
    const transform = flowCloudScreenTransform(p, camera, opening);
    const anchor = projectScreenRect(settledClouds[0], transform);
    close(anchor.x, transform.x + settledClouds[0].x * transform.scale);
    close(anchor.y, transform.y + settledClouds[0].y * transform.scale);
  }
  assert.deepEqual(flowCloudScreenTransform(1, opening, opening), {x: 0, y: 0, scale: 1});
  assert.deepEqual(settledClouds.map(rect => projectScreenRect(rect, flowCloudScreenTransform(1, opening, opening))), settledClouds);
  const nearCamera = sharedWorldCamera({entryProgress: .999999, outgoingCostCamera: endpoint, flowPlayback: flowOpeningPlayback});
  const near = projectScreenRect(settledClouds[0], flowCloudScreenTransform(.999999, nearCamera, opening));
  close(near.x, settledClouds[0].x, .002);
  close(near.y, settledClouds[0].y, .002);
  close(near.width, settledClouds[0].width, .002);

  const later = sampleFlow(12, ULTIMATE_3_DEFAULTS);
  const laterState = introducingFlowState(later.playback);
  assert.equal(later.entryProgress, 1);
  assert.deepEqual(flowCloudScreenTransform(1, flowCameraInSharedWorld(laterState.camera), opening), {x: 0, y: 0, scale: 1});
  assert.equal(laterState.cloudTranslateY, 900, 'native Flow cloud exit must continue after the attachment handoff');
  assert.ok(interpolateCloudRects(laterState.cloudProgress, ULTIMATE_3_DEFAULTS.flow.controls.cloudYOffset, laterState.cloudTranslateY)
    .every(rect => rect.y >= 720), 'native Flow exit must move both screen-attached clouds below the viewport');
});

test('forward/reverse seeks, retimed entry, zero-duration entry, and holds are pure and deterministic', () => {
  const retimed = normalizeSettings({...ULTIMATE_3_DEFAULTS, flow: {...ULTIMATE_3_DEFAULTS.flow, entrySlide: {at: .4, duration: 2}}});
  const samples = [0, .4, 1.1, 2.4, 5, 30].map(time => sampleFlow(time, retimed));
  for (const index of [5, 2, 0, 3, 1, 4]) assert.deepEqual(sampleFlow([0, .4, 1.1, 2.4, 5, 30][index], retimed), samples[index]);
  assert.equal(samples[0].entryProgress, 0);
  assert.equal(samples[3].entryProgress, 1);
  assert.equal(samples[5].nativeTime, 11.8);
  const zero = normalizeSettings({...ULTIMATE_3_DEFAULTS, flow: {...ULTIMATE_3_DEFAULTS.flow, entrySlide: {at: 0, duration: 0}}});
  const instant = sampleFlow(0, zero);
  assert.equal(instant.entryProgress, 1);
  const instantCamera = sharedWorldCamera({entryProgress: instant.entryProgress, outgoingCostCamera: endpoint, flowPlayback: instant.playback});
  const instantOpening = flowCameraInSharedWorld(introducingFlowState(instant.playback).camera);
  assert.deepEqual(instantCamera, instantOpening);
  assert.deepEqual(flowCloudScreenTransform(instant.entryProgress, instantCamera, instantOpening), {x: 0, y: 0, scale: 1});
  const retimedMid = samples[2];
  const retimedCamera = sharedWorldCamera({entryProgress: retimedMid.entryProgress, outgoingCostCamera: endpoint, flowPlayback: retimedMid.playback});
  const retimedCloud = flowCloudScreenTransform(retimedMid.entryProgress, retimedCamera, flowCameraInSharedWorld(introducingFlowState(retimedMid.playback).camera));
  assert.ok(retimedMid.entryProgress > 0 && retimedMid.entryProgress < 1);
  assert.ok(Object.values(retimedCloud).every(Number.isFinite));
  assert.notDeepEqual(retimedCloud, {x: 0, y: 0, scale: 1});
});

test('render architecture has one persistent world/grid, source Cost overlays, and no split panels', () => {
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  assert.equal((scene.match(/className="micro18-shared-world"/g) ?? []).length, 1);
  assert.equal((scene.match(/className="micro18-shared-grid"/g) ?? []).length, 1);
  assert.match(scene, /data-shared-camera="true"/);
  assert.match(scene, /className="micro18-flow-cloud-layer"/);
  assert.match(scene, /flowCloudScreenTransform\(flow\.entryProgress, camera,/);
  assert.match(scene, /isFlow \? <FlowSubtitles progress=\{flow\.playback\.progress\}\/> : <Subtitles progress=\{cost\.progress\}\/>/);
  assert.match(css, /\.micro18-cost-smoke\{[^}]*z-index:1/);
  assert.match(css, /\.micro18-cost-content\{z-index:2\}/);
  assert.match(css, /\.micro18-cost-budget\{z-index:3\}/);
  assert.match(css, /\.micro18-shared-scene>\.micro16-subtitle-layer\{z-index:11\}/);
  for (const obsolete of ['micro18-slide-panel', 'micro18-slide-stage', 'micro18-bridge-grid', 'costFlowGridGeometry']) {
    assert.equal(scene.includes(obsolete) || css.includes(obsolete), false, `${obsolete} must be deleted`);
  }
});
