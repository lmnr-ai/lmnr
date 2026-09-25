import assert from 'node:assert/strict';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {CELL, FIGMA, ROWS, SPEED, TILE_PERIOD, positiveModulo, streamPhase, tileOrigin} from './geometry';
import {sampleStreamers} from './sample';
import {MICRO_08_DISTANCE, MICRO_08_DURATION, MICRO_08_TIMELINE} from './timeline';

const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
assert.deepEqual(ROWS.map(row => row.agent), [
  {x: 760, y: 72}, {x: 808, y: 168}, {x: 856, y: 264}, {x: 904, y: 360},
  {x: 850, y: 456}, {x: 808, y: 552}, {x: 760, y: 648},
]);
assert.deepEqual(ROWS.map(row => row.y), [48, 144, 240, 336, 432, 528, 624]);
assert.equal(MICRO_08_DISTANCE, SPEED * MICRO_08_DURATION);
assert.equal(TILE_PERIOD % CELL, 0);
assert.equal(positiveModulo(-1, TILE_PERIOD), TILE_PERIOD - 1);
for (const [index, row] of ROWS.entries()) {
  assert.equal(row.blocks.reduce((sum, block) => sum + block.width, 0), TILE_PERIOD);
  assert.equal(row.blocks[0].x, row.agent.x - TILE_PERIOD);
  const original = FIGMA.rows[index].blocks.map(({x, width, kind}) => ({x, width, kind}));
  assert.deepEqual(row.blocks.slice(-original.length), original, 'all authored geometry retained');
  assert.ok(row.blocks.slice(0, -original.length).every(block => block.x + block.width < 0));
  assert.deepEqual(row.blocks.filter(block => block.x + block.width > 0), original.filter(block => block.x + block.width > 0), 'visible Figma geometry');
  for (const [i, block] of row.blocks.entries()) {
    assert.equal(block.width === CELL, i % 2 === 0, 'square/wide alternation');
    assert.ok([48, 96, 120, 144].includes(block.width));
    const next = row.blocks[(i + 1) % row.blocks.length];
    assert.equal(block.x + block.width, next.x + (i === row.blocks.length - 1 ? TILE_PERIOD : 0));
  }
}
// Explicitly expand only the neighboring pattern copies for independent coverage checks.
const visible = (row: typeof ROWS[number], phase: number) => [-1, 0, 1, 2].flatMap(copy => row.blocks.map(block => ({
  ...block, x: tileOrigin(row.agent.x, phase) + block.x - (row.agent.x - TILE_PERIOD) + copy * TILE_PERIOD,
}))).filter(block => block.x < row.agent.x && block.x + block.width > 0).sort((a, b) => a.x - b.x);
let seed = 8;
const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
const times = [0, 1 / 30, 4 - 1e-6, 4, 4 + 1e-6, 8 - 1 / 30, 8, 8 + 1 / 30, 3600, 86400.125, 1e12 + .125, -100.125,
  ...Array.from({length: 300}, () => random() * 1e6)];
const primitives = ROWS.reduce((count, row) => count + row.blocks.length, 0);
for (const time of times) {
  const state = sampleStreamers(time);
  assert.ok(state.stripPhase >= 0 && state.stripPhase < TILE_PERIOD);
  near(positiveModulo(state.stripPhase, CELL), state.gridPhase);
  assert.equal(ROWS.reduce((count, row) => count + row.blocks.length, 0), primitives);
  for (const row of ROWS) {
    const blocks = visible(row, state.stripPhase);
    assert.ok(blocks.length <= Math.ceil(row.agent.x / CELL) + 2);
    assert.ok(blocks[0].x <= 0 && blocks.at(-1)!.x + blocks.at(-1)!.width >= row.agent.x);
    for (let i = 1; i < blocks.length; i++) near(blocks[i - 1].x + blocks[i - 1].width, blocks[i].x);
  }
  assert.deepEqual(sampleStreamers(time), state, 'random seek deterministic');
  for (const period of [4, 8]) for (const key of ['stripPhase', 'gridPhase', 'spinnerAngle'] as const) near(sampleStreamers(time + period)[key], state[key], 1e-6);
}
const forward = times.map(sampleStreamers);
assert.deepEqual([...times].reverse().map(sampleStreamers).reverse(), forward, 'reverse seek');
assert.deepEqual(sampleStreamers(0), sampleStreamers(8));
assert.deepEqual(sampleStreamers(0), sampleStreamers(4));
for (const boundary of [4, 8, 86400]) {
  const before = sampleStreamers(boundary - 1 / 30), after = sampleStreamers(boundary);
  near(positiveModulo(after.stripPhase - before.stripPhase, TILE_PERIOD), SPEED / 30);
  near(positiveModulo(after.gridPhase - before.gridPhase, CELL), SPEED / 30);
}
const a = sampleStreamers(.01), b = sampleStreamers(.02);
near(tileOrigin(760, b.stripPhase) - tileOrigin(760, a.stripPhase), -SPEED * .01);
near(-(b.gridPhase - a.gridPhase), -SPEED * .01);
const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_08_TIMELINE), {});
for (const t of [0, .25, 1, 3.999, 4, 7.9, 8]) {
  const {current} = computeClipState(clips.find(clip => clip.key === 'travel')!, t, t) as {current: {distance: number}};
  near(current.distance, t * SPEED);
  const live = streamPhase(current.distance), sampled = sampleStreamers(t);
  for (const key of ['stripPhase', 'gridPhase', 'spinnerAngle'] as const) near(live[key], sampled[key]);
}
console.log(`Micro08 geometry: ${times.length} times, 7 exact rows, ${primitives} bounded pattern blocks; Figma, coverage, closure, velocity and DialKit parity passed.`);
