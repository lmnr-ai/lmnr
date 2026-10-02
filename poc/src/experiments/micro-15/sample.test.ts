import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CELL_COUNT, CLUSTERS, TOKENS, cellCenter} from '../micro-14/geometry';
import {Micro14Scene} from '../micro-14/Scene';
import {sampleMicro14} from '../micro-14/sample';
import {MICRO_14_DEFAULTS} from '../micro-14/timeline';
import {START_CELLS} from './starting-positions';
import {AGENT_TIMING} from './agent-window';
import {sampleMicro15, sampleMicro15Frame} from './sample';
import {MICRO_15_DEFAULTS, MICRO_15_TIMING, MICRO_15_TIMELINE, micro15DurationFrames, type Micro15Timing} from './timeline';
import {travelTimingForCell} from './travel';

const controls = {...MICRO_15_DEFAULTS};
const timing = MICRO_15_TIMING;
assert.deepEqual(timing, {
  appearance: {at: 0, duration: 1.19}, travelStart: {at: 1.15, duration: .35},
  coverAppearance: {at: 2.08, duration: .38}, triangleScaleOut: {at: 1.72, duration: .59},
  triangleScaleIn: {at: 2.09, duration: .68},
  ...AGENT_TIMING,
  subtitleIssues: {at: 0, duration: .94},
  subtitlePatterns: {at: .94, duration: 2.42},
  subtitleReady: {at: 3.32, duration: 3.68},
}, 'saved authoring timeline defaults, with additive agent and subtitle tracks');
const start = sampleMicro15(0, controls);
const prior = sampleMicro14(0, MICRO_14_DEFAULTS);
assert.deepEqual(Object.keys(MICRO_15_TIMELINE), ['appearance', 'travelStart', 'coverAppearance', 'triangleScaleOut', 'triangleScaleIn', ...Object.keys(AGENT_TIMING), 'subtitleIssues', 'subtitlePatterns', 'subtitleReady'], 'existing tracks are preserved and subtitle tracks added' );
for (const key of ['subtitleIssues','subtitlePatterns','subtitleReady'] as const) assert.deepEqual(MICRO_15_TIMELINE[key], {
  ...MICRO_15_TIMING[key], transition: {type: 'spring', bounce: .2}, from: {progress: 0}, to: {progress: 1},
}, `${key} preserves the authored spring and progress bindings`);
assert.deepEqual(Object.keys(MICRO_15_DEFAULTS), ['warningAppearanceDuration', 'travelDuration', 'timelineDuration'], 'final transition controls are not regular dials');
assert.equal(Object.keys(START_CELLS).length, 47);
assert.equal(new Set(Object.values(START_CELLS)).size, 47);
assert.deepEqual(start.tokens.filter(pose => pose.token.kind === 'warning'), prior.tokens.filter(pose => pose.token.kind === 'warning'), 'frozen starts match this iteration of Animation 14');
assert.deepEqual(start.warningAppearance, prior.warningAppearance);
assert.ok(Object.values(start.warningAppearance).every(progress => progress === 0));
assert.ok(start.groundDots.every(dot => dot.scale === 1));
const beforeTravel = sampleMicro15(timing.appearance.at + timing.appearance.duration, controls);
for (const [id, cell] of Object.entries(START_CELLS)) {
  assert.equal(beforeTravel.groundDots[cell].scale, 1, 'the supplied travel overlap has already restored the fixed ground dot');
  assert.equal(beforeTravel.warningAppearance[id], 1);
}
const flights = Object.fromEntries(Object.entries(START_CELLS).map(([id, cell]) => [id, travelTimingForCell(cell, timing.travelStart, controls.travelDuration)]));
assert.equal(new Set(Object.values(flights).map(clip => clip.at)).size, 47, 'each cell gets its own random start');
for (const [id, clip] of Object.entries(flights)) {
  assert.ok(clip.at >= timing.travelStart.at && clip.at <= timing.travelStart.at + timing.travelStart.duration);
  assert.equal(clip.duration, controls.travelDuration, 'flight duration is a dial, not the start-window length');
  const before = sampleMicro15(clip.at - .001, controls).tokens.find(pose => pose.token.id === id)!;
  assert.deepEqual({x: before.x, y: before.y}, cellCenter(START_CELLS[id]), 'triangle waits for its own sampled start');
  const halfway = sampleMicro15(clip.at + clip.duration / 2, controls).tokens.find(pose => pose.token.id === id)!;
  const origin = cellCenter(START_CELLS[id]);
  const target = cellCenter(Number(id.slice(5)));
  assert.ok(Math.abs(halfway.x - (origin.x + target.x) / 2) < 1e-8 && Math.abs(halfway.y - (origin.y + target.y) / 2) < 1e-8);
  const arrived = sampleMicro15(clip.at + clip.duration + .001, controls).tokens.find(pose => pose.token.id === id)!;
  assert.deepEqual({x: arrived.x, y: arrived.y}, target);
}
const staggered = sampleMicro15(timing.travelStart.at + timing.travelStart.duration / 2, controls).tokens.filter(pose => pose.token.kind === 'warning');
const stillWaiting = staggered.filter(pose => pose.x === cellCenter(START_CELLS[pose.token.id]).x && pose.y === cellCenter(START_CELLS[pose.token.id]).y);
assert.ok(stillWaiting.length > 0 && stillWaiting.length < 47, 'some cells wait while others are already traveling');
const groundReference = sampleMicro15(timing.travelStart.at, controls).groundDots;
for (const time of [0, .5, 1.01, 1.11, 1.2, 1.5, 2, 2.5, 3.41, 6]) {
  const sample = sampleMicro15(time, controls);
  assert.equal(sample.groundDots.length, CELL_COUNT);
  assert.equal(new Set(sample.groundDots.map(dot => dot.cell)).size, CELL_COUNT);
  for (const dot of sample.groundDots) assert.deepEqual({x: dot.x, y: dot.y}, cellCenter(dot.cell), 'dots stay painted at fixed grid centers');
  if (time >= timing.travelStart.at) assert.deepEqual(sample.groundDots, groundReference, 'during travel, all ground dots remain fully present and never move');
  for (const pose of sample.tokens) {
    const target = cellCenter(Number(pose.token.id.slice(5)));
    if (pose.token.kind === 'dot') {
      assert.deepEqual({x: pose.x, y: pose.y}, target, 'dot identities are never swapped');
      continue;
    }
    const origin = cellCenter(START_CELLS[pose.token.id]);
    assert.ok(Math.abs((pose.x - origin.x) * (target.y - origin.y) - (pose.y - origin.y) * (target.x - origin.x)) < 1e-7, 'every triangle follows one straight line');
    assert.ok(pose.x >= Math.min(origin.x, target.x) - 1e-8 && pose.x <= Math.max(origin.x, target.x) + 1e-8);
    assert.ok(pose.y >= Math.min(origin.y, target.y) - 1e-8 && pose.y <= Math.max(origin.y, target.y) + 1e-8);
  }
}
for (const cluster of CLUSTERS) {
  const readyAt = start.clusters[cluster.id].readyAt;
  const lastArrival = Math.max(...TOKENS.filter(token => token.clusterId === cluster.id).map(token => flights[token.id].at + flights[token.id].duration));
  assert.equal(readyAt, lastArrival, 'cover is triggered by the actual last random arrival in this group');
  assert.equal(sampleMicro15(readyAt - .001, controls).clusters[cluster.id].clusterBackgroundOpacity, 0);
  assert.ok(sampleMicro15(readyAt + .001, controls).clusters[cluster.id].clusterBackgroundOpacity > 0);
  for (const pose of sampleMicro15(readyAt, controls).tokens.filter(pose => pose.token.clusterId === cluster.id)) {
    const target = cellCenter(Number(pose.token.id.slice(5)));
    assert.ok(Math.abs(pose.x - target.x) < 1e-8 && Math.abs(pose.y - target.y) < 1e-8);
  }
}
const byArrival = Object.values(start.clusters).map(cluster => cluster.readyAt).sort((a, b) => a - b);
const overlapping = Object.values(sampleMicro15((byArrival[0] + byArrival.at(-1)!) / 2, controls).clusters);
assert.ok(overlapping.some(cluster => cluster.largeWarningScale > 0) && overlapping.some(cluster => cluster.largeWarningScale === 0));
const end = sampleMicro15(6, controls);
for (const pose of end.tokens) assert.deepEqual({x: pose.x, y: pose.y}, cellCenter(Number(pose.token.id.slice(5))));
assert.ok(Object.values(end.clusters).every(cluster => cluster.smallWarningScale === 0 && cluster.largeWarningScale === 1));
assert.equal(end.phase, 'end-hold');
assert.equal(micro15DurationFrames(), 210);
const mid = sampleMicro15(1.5, controls);
sampleMicro15(6, controls); sampleMicro15(0, controls);
assert.deepEqual(sampleMicro15(1.5, controls), mid, 'seek order cannot alter direct travel');
assert.deepEqual(sampleMicro15Frame(45, controls), mid, 'Remotion/editor sampler parity');
for (const cell of Object.values(START_CELLS)) {
  const old = travelTimingForCell(cell, timing.travelStart, controls.travelDuration);
  const retimed = travelTimingForCell(cell, {at: 2, duration: 8}, controls.travelDuration);
  assert.equal(retimed.duration, old.duration);
  assert.ok(Math.abs((old.at - timing.travelStart.at) / timing.travelStart.duration - (retimed.at - 2) / 8) < 1e-8, 'resizing preserves random order, not total flight length');
  assert.equal(travelTimingForCell(cell, timing.travelStart, 0).at, old.at, 'duration changes cannot reroll start times');
  assert.equal(travelTimingForCell(cell, {at: 2, duration: 0}, controls.travelDuration).at, 2, 'zero-width window synchronizes starts');
}
assert.deepEqual(sampleMicro15(3, {...controls, travelDuration: 0}).tokens, end.tokens, 'zero-duration travel snaps at each random start');
const mergeAt = start.clusters['green-2'].readyAt;
const independentlyTimed = sampleMicro15(mergeAt + .2, controls, {...timing,
  coverAppearance: {...timing.coverAppearance, duration: 1},
  triangleScaleIn: {...timing.triangleScaleIn, duration: .4},
  triangleScaleOut: {...timing.triangleScaleOut, duration: .8}}).clusters['green-2'];
assert.ok(Math.abs(independentlyTimed.clusterBackgroundOpacity - .104) < 1e-8, 'cover fade has its own duration');
assert.ok(Math.abs(independentlyTimed.largeWarningScale - .5) < 1e-8, 'large triangle scale-in has its own duration');
assert.ok(Math.abs(independentlyTimed.smallWarningScale - .84375) < 1e-8, 'small triangle scale-out has its own duration');
const instantMerge = sampleMicro15(mergeAt, controls, {...timing,
  coverAppearance: {...timing.coverAppearance, duration: 0},
  triangleScaleIn: {...timing.triangleScaleIn, duration: 0},
  triangleScaleOut: {...timing.triangleScaleOut, duration: 0}}).clusters['green-2'];
assert.equal(instantMerge.clusterBackgroundOpacity, 1);
assert.equal(instantMerge.largeWarningScale, 1);
assert.equal(instantMerge.smallWarningScale, 0);
for (const key of ['coverAppearance', 'triangleScaleIn', 'triangleScaleOut'] as const) {
  const prolonged: Micro15Timing = {...timing, [key]: {...timing[key], duration: 2}};
  assert.equal(sampleMicro15(byArrival.at(-1)! + 1, controls, prolonged).phase, 'merge', 'end hold waits for every independently timed component');
  assert.equal(sampleMicro15(byArrival.at(-1)! + 2.01, controls, prolonged).phase, 'end-hold');
}
const delayedCover = sampleMicro15(5.5, controls, {...timing, coverAppearance: {at: 6, duration: .8}}).clusters['green-2'];
assert.equal(delayedCover.clusterBackgroundOpacity, 0, 'moving a track delays that transition');
assert.equal(delayedCover.smallWarningScale, 0, 'moving cover timing does not move the scale-out track');
assert.equal(delayedCover.largeWarningScale, 1, 'moving cover timing does not move the scale-in track');
const svg = renderToStaticMarkup(createElement(Micro14Scene, mid));
assert.equal((svg.match(/data-ground-cell=/g) ?? []).length, CELL_COUNT);
assert.ok(svg.indexOf('stationary ground dots') < svg.indexOf('stable grid occupants'), 'dot layer renders underneath traveling triangles');
assert.ok(!svg.includes('data-appearance-dot='), 'no traveling dot is rendered with a warning');
assert.equal((svg.match(/data-token-id=/g) ?? []).length, 47);
console.log('Micro15: frozen starts, random start window, independent flight duration, direct paths, stationary dots, last-arrival covers, independent merge tracks, retiming, rewind, and renderer/export parity passed.');
