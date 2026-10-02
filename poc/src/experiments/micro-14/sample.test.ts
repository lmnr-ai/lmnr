import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {BORDER_WIDTH, CELL_COUNT, CLUSTERS, COLORS, GRID, GROUPED_WARNING_COUNT, SINGLETON, SMALL_WARNING, TOKENS, VIEWPORT, borderBoxContentCenter, cellCenter, cellIndex, inwardBorderRects} from './geometry';
import {sampleMicro14 as sampleAtTime, sampleMicro14Frame as sampleAtFrame} from './sample';
import {clusterDispersionStart, getDispersionHistory} from './dispersion';
import {MICRO_14_DEFAULTS, MICRO_14_FPS, MICRO_14_TIMELINE_ID, MICRO_14_TIMING, micro14DurationFrames, type Micro14Controls, type Micro14Timing} from './timeline';

const controls = {...MICRO_14_DEFAULTS};
assert.deepEqual(MICRO_14_TIMING, {appearance: {at: 0, duration: 1.01}, swapping: {at: 1.11, duration: 2.3}}, 'authored timeline defaults');
// Pin the slow fixture for sub-frame interpolation/gap checks. Actual authored
// defaults can be much shorter and cross multiple simulation steps per frame.
const timing: Micro14Timing = {appearance: {at: 0, duration: .8}, swapping: {at: 1, duration: 9}};
const sampleMicro14 = (time: number, settings: Micro14Controls, clips = timing) => sampleAtTime(time, settings, clips);
const sampleMicro14Frame = (frame: number, settings: Micro14Controls, clips = timing) => sampleAtFrame(frame, settings, clips);
const phases = {gatherStart: timing.swapping.at * 30, gatherEnd: (timing.swapping.at + timing.swapping.duration) * 30,
  mergeEnd: (timing.swapping.at + timing.swapping.duration + controls.warningCoverDuration) * 30};
assert.equal(MICRO_14_FPS, 30);
assert.equal(phases.gatherEnd - phases.gatherStart, 270, '90 simulation steps are spread across 270 authored frames');
assert.equal(micro14DurationFrames(), 393);
assert.match(MICRO_14_TIMELINE_ID, /micro-animation-14/);
const start = sampleMicro14Frame(0, controls);
assert.equal(start.phase, 'dispersed-hold');
assert.deepEqual(sampleMicro14Frame(phases.gatherStart - 1, controls).tokens, start.tokens, 'start hold is stable');
assert.deepEqual(sampleMicro14Frame(phases.gatherStart, controls).tokens, start.tokens, 'first gathering boundary does not skip a state');
assert.notDeepEqual(sampleMicro14Frame(phases.gatherStart + 1, controls).tokens, start.tokens);
const intermediate = sampleMicro14Frame(phases.gatherEnd, controls);
assert.equal(intermediate.phase, 'merge', 'earlier clusters are already merged while the last finishes');
for (const pose of intermediate.tokens) assert.deepEqual({x: pose.x, y: pose.y}, cellCenter(Number(pose.token.id.slice(5))), 'intermediate restores every identity');
for (const cluster of CLUSTERS) {
  const readyAt = start.clusters[cluster.id].readyAt;
  const beginning = sampleMicro14(readyAt, controls).clusters[cluster.id];
  assert.equal(beginning.smallWarningScale, 1);
  assert.equal(beginning.clusterBackgroundOpacity, 0);
  assert.equal(beginning.largeWarningScale, 0);
  const middle = sampleMicro14(readyAt + .4, controls).clusters[cluster.id];
  for (const value of [middle.smallWarningScale, middle.clusterBackgroundOpacity, middle.largeWarningScale]) assert.ok(Math.abs(value - .5) < 1e-8);
}
const end = sampleMicro14Frame(phases.mergeEnd, controls);
assert.equal(end.phase, 'end-hold');
for (const merge of Object.values(end.clusters)) {
  assert.equal(merge.smallWarningScale, 0); assert.equal(merge.clusterBackgroundOpacity, 1); assert.equal(merge.largeWarningScale, 1);
}
assert.deepEqual(sampleMicro14Frame(micro14DurationFrames() - 1, controls).tokens, sampleMicro14Frame(micro14DurationFrames() + 100, controls).tokens, 'end hold is stable');
for (let frame = phases.gatherStart; frame < phases.gatherEnd; frame++) {
  const a = sampleMicro14Frame(frame, controls);
  const b = sampleMicro14Frame(frame + 1, controls);
  for (let index = 0; index < CELL_COUNT; index++) {
    assert.ok(Math.abs(a.tokens[index].x - b.tokens[index].x) <= GRID.cell);
    assert.ok(Math.abs(a.tokens[index].y - b.tokens[index].y) <= GRID.cell);
  }
}
const fractional = sampleMicro14Frame(phases.gatherStart + 4.5, controls);
for (let index = 0; index < CELL_COUNT; index++) {
  const before = sampleMicro14Frame(phases.gatherStart + 4, controls).tokens[index];
  const after = sampleMicro14Frame(phases.gatherStart + 5, controls).tokens[index];
  assert.ok(fractional.tokens[index].x >= Math.min(before.x, after.x) && fractional.tokens[index].x <= Math.max(before.x, after.x));
  assert.ok(fractional.tokens[index].y >= Math.min(before.y, after.y) && fractional.tokens[index].y <= Math.max(before.y, after.y));
}
assert.notDeepEqual(sampleMicro14Frame(0, {...controls, seed: controls.seed + 1}).tokens, start.tokens, 'seed changes dispersed start');
assert.deepEqual(sampleMicro14Frame(phases.gatherEnd, {...controls, dispersionFrames: 20}).tokens, intermediate.tokens, 'frame count never changes target layout or gathering duration');
const longer = {...timing, swapping: {at: 2, duration: 18}};
assert.equal(micro14DurationFrames(24), 720);
assert.deepEqual(sampleMicro14(5.5, controls).tokens, sampleMicro14(11, controls, longer).tokens, 'retiming distributes the same steps evenly');
// One slot lasts 0.1s. At 50% gap, the second half must remain stationary.
const gapped = {...controls, swapGap: .5};
assert.deepEqual(sampleMicro14(1.06, gapped).tokens, sampleMicro14(1.09, gapped).tokens, 'gap holds the completed swap');
assert.notDeepEqual(sampleMicro14(1.01, gapped).tokens, sampleMicro14(1.04, gapped).tokens, 'movement occupies the first half');
assert.notDeepEqual(sampleMicro14(1.06, {...controls, swapGap: 0}).tokens, sampleMicro14(1.09, {...controls, swapGap: 0}).tokens, 'zero gap keeps moving');
const history = getDispersionHistory(controls.seed, controls.dispersionFrames, controls.swapProbability, controls.smallClusterDelay);
for (let step = 0; step <= controls.dispersionFrames; step++) {
  const pose = sampleMicro14(timing.swapping.at + step * timing.swapping.duration / controls.dispersionFrames, controls);
  const state = history.states[controls.dispersionFrames - step];
  for (const token of pose.tokens) {
    const expected = cellCenter(state.indexOf(token.token.id));
    assert.ok(Math.abs(token.x - expected.x) < 1e-8 && Math.abs(token.y - expected.y) < 1e-8, 'each boundary replays the exact recorded state');
  }
}
for (const cluster of CLUSTERS) {
  const remaining = clusterDispersionStart(cluster.size, controls.dispersionFrames, controls.smallClusterDelay);
  const settledAt = timing.swapping.at + (1 - remaining / controls.dispersionFrames) * timing.swapping.duration;
  for (const time of [settledAt, (settledAt + 10) / 2, 10]) {
    for (const pose of sampleMicro14(time, controls).tokens.filter(pose => pose.token.clusterId === cluster.id)) {
      assert.deepEqual({x: pose.x, y: pose.y}, cellCenter(Number(pose.token.id.slice(5))), 'smaller groups finish early and stay locked');
    }
  }
}
for (const cluster of CLUSTERS) {
  const readyAt = start.clusters[cluster.id].readyAt;
  const slower = sampleMicro14(readyAt + 1, {...controls, warningCoverDuration: 2}).clusters[cluster.id];
  for (const value of [slower.smallWarningScale, slower.clusterBackgroundOpacity, slower.largeWarningScale]) assert.ok(Math.abs(value - .5) < 1e-8);
  assert.equal(slower.readyAt, readyAt, 'cover duration never changes formation time');
  const instantCover = sampleMicro14(readyAt, {...controls, warningCoverDuration: 0}).clusters[cluster.id];
  assert.equal(instantCover.clusterBackgroundOpacity, 1);
  assert.equal(instantCover.largeWarningScale, 1);
  assert.equal(instantCover.smallWarningScale, 0);
}
// Merge completion overlaps other groups still gathering, without future dislodging.
const smallReady = start.clusters['green-2'].readyAt;
const overlapping = sampleMicro14(smallReady + 1, controls);
assert.equal(overlapping.clusters['green-2'].largeWarningScale, 1);
assert.equal(overlapping.clusters['pink-4'].largeWarningScale, 0);
assert.equal(overlapping.phase, 'gathering');
for (const cluster of CLUSTERS) {
  const readyAt = start.clusters[cluster.id].readyAt;
  const before = sampleMicro14(Math.max(0, readyAt - .001), controls).clusters[cluster.id];
  assert.equal(before.smallWarningScale, 1, 'never shrink before the last arrival');
  assert.equal(before.clusterBackgroundOpacity, 0);
  for (const time of [readyAt, readyAt + .01, readyAt + .5, 10, 12]) {
    for (const pose of sampleMicro14(time, controls).tokens.filter(pose => pose.token.clusterId === cluster.id)) {
      const target = cellCenter(Number(pose.token.id.slice(5)));
      assert.ok(Math.abs(pose.x - target.x) < 1e-8 && Math.abs(pose.y - target.y) < 1e-8, 'merged group never moves again');
    }
  }
  const historyStep = history.clusterReadySteps[cluster.id];
  assert.ok(Math.abs(readyAt - (1 + (historyStep - controls.swapGap) * .1)) < 1e-8, 'readiness excludes the final gap');
}
const rewind = sampleMicro14(smallReady + .3, controls);
sampleMicro14(13, controls); sampleMicro14(0, controls);
assert.deepEqual(sampleMicro14(smallReady + .3, controls), rewind, 'per-cluster merging is seek-order independent');
for (const noMovement of [{...controls, dispersionFrames: 0}, {...controls, swapProbability: 0}]) {
  const zeroStart = sampleMicro14(0, noMovement);
  assert.ok(Object.values(zeroStart.clusters).every(cluster => cluster.readyAt > 0 && cluster.readyAt <= timing.appearance.at + timing.appearance.duration));
  assert.ok(Object.values(sampleMicro14(2, noMovement).clusters).every(cluster => cluster.largeWarningScale === 1));
}
assert.equal(micro14DurationFrames(22), 660);
const instant = {...timing, swapping: {at: 1, duration: 0}};
assert.deepEqual(sampleMicro14(1, controls, instant).tokens, intermediate.tokens, 'zero-duration clip snaps deterministically');
assert.deepEqual(sampleMicro14Frame(0, {...controls, dispersionFrames: 0}).tokens, intermediate.tokens, 'zero frames starts at exact intermediate');
assert.deepEqual(VIEWPORT, {width: 1280, height: 720});
assert.deepEqual(GRID, {columns: 18, rows: 12, cell: 78, x: -62, y: -71});
assert.equal(GRID.columns * GRID.cell, 1404); assert.equal(GRID.rows * GRID.cell, 936);
assert.deepEqual(SMALL_WARNING, {width: 25.41796875, height: 23.604496002197266});
assert.equal(TOKENS.filter(token => token.kind === 'warning').length, GROUPED_WARNING_COUNT + 1);
assert.equal(GROUPED_WARNING_COUNT, 46); assert.equal(CLUSTERS.length, 6);
assert.equal(TOKENS[cellIndex(SINGLETON.column, SINGLETON.row)].clusterId, undefined, 'Figma singleton remains outside merged groups');
assert.deepEqual(CLUSTERS.map(({x,y,width,height}) => ({x,y,width,height})), [
  {x:328,y:475,width:312,height:312}, {x:94,y:241,width:234,height:234}, {x:1108,y:163,width:234,height:234},
  {x:952,y:397,width:156,height:156}, {x:328,y:85,width:156,height:156}, {x:640,y:319,width:156,height:156},
]);
assert.equal(BORDER_WIDTH, 1);
assert.deepEqual(inwardBorderRects(16, -71, GRID.cell, GRID.cell), {
  left: {x:16, y:-71, width:1, height:78},
  bottom: {x:16, y:6, width:78, height:1},
}, 'grid borders occupy inward pixel strips rather than centered SVG strokes');
assert.deepEqual(CLUSTERS.map(cluster => borderBoxContentCenter(cluster.x, cluster.y, cluster.width, cluster.height)), [
  {x:484.5,y:630.5}, {x:211.5,y:357.5}, {x:1225.5,y:279.5},
  {x:1030.5,y:474.5}, {x:406.5,y:162.5}, {x:718.5,y:396.5},
], 'large warnings use captured border-box content centers');
for (const cluster of CLUSTERS) {
  const borders = inwardBorderRects(cluster.x, cluster.y, cluster.width, cluster.height);
  assert.equal(borders.left.x, cluster.x);
  assert.equal(borders.left.x + borders.left.width, cluster.x + 1);
  assert.equal(borders.bottom.y, cluster.y + cluster.height - 1);
  assert.equal(borders.bottom.y + borders.bottom.height, cluster.y + cluster.height);
}
assert.deepEqual(COLORS, {background:'#1a1a1a',clusterBackground:'#1f1f1f',grid:'#333333',dot:'#4e4e4e'});
const expectedFills = {purple:'#A789F2',yellow:'#FDDB08',blue:'#4685E7',salmon:'#F78079',green:'#26AE6C',pink:'#F59ED5'};
for (const [color, fill] of Object.entries(expectedFills)) {
  for (const size of ['small','large']) {
    const path = fileURLToPath(new URL(`../../../public/micro-14/${size}-${color}.svg`, import.meta.url));
    const svg = readFileSync(path, 'utf8');
    assert.ok(svg.length > 100 && svg.includes(fill));
    if (size === 'small') assert.match(svg, /width="25\.418" height="23\.6045"/);
  }
}
console.log('Micro14 sampling: retiming, interpolation, per-cluster cover duration/endpoints, deterministic rewind, Figma geometry, singleton, and assets passed.');
