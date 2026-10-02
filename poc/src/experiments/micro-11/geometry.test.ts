import assert from 'node:assert/strict';
import {AGENT, BIG_GRID, BIG_GRID_CELLS, CELL, MICRO_11_DEFAULTS, STREAM_PERIOD, sampleMicro11} from './geometry';
import {sampleMicro11Transition} from './sample';
import {MICRO_11_TIMELINE} from './timeline';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const at = (time: number) => sampleMicro11(time, MICRO_11_DEFAULTS, sampleMicro11Transition(time));
const start = at(0);
assert.deepEqual(start.camera, {x: AGENT.x, y: AGENT.y, scale: 1});
near(start.agentRadius, AGENT.radius);
assert.ok(start.camera.x - BIG_GRID.pitch / 2 < 0);
assert.ok(start.camera.x + BIG_GRID.pitch / 2 > 1280);
assert.ok(start.camera.y - BIG_GRID.pitch / 2 < 0);
assert.ok(start.camera.y + BIG_GRID.pitch / 2 > 720);
assert.equal(STREAM_PERIOD % CELL, 0, 'stream tile closes on a grid line');
near(sampleMicro11(STREAM_PERIOD / MICRO_11_DEFAULTS.streamerSpeed).streamPhase, 0);
near(sampleMicro11(CELL / MICRO_11_DEFAULTS.streamerSpeed).gridPhase, 0);
near(sampleMicro11(.1).gridPhase, sampleMicro11(.1).streamPhase % CELL);
const reveal = at(MICRO_11_TIMELINE.streamCollapse.at);
assert.equal(reveal.streamHeightScale, 1, 'streams remain full-height through neighbor reveal');
near(CELL * reveal.contentScale * reveal.streamHeightScale * reveal.camera.scale, 2 * reveal.agentRadius * reveal.camera.scale);
// Also cover retiming: zoom anywhere while collapse has not started.
for (const zoomOut of [0, .1, .4, .8, 1]) {
  const state = sampleMicro11(4, MICRO_11_DEFAULTS, {zoomOut, smallGridFade: 0, streamCollapse: 0, loaderFade: 0, dotDim: 0});
  near(CELL * state.contentScale, 2 * state.agentRadius);
  near(state.camera.x, 640);
  near(state.camera.y, 360);
}
assert.ok(reveal.camera.x - BIG_GRID.pitch * reveal.camera.scale > 0, 'left neighbor visible before collapse');
const collapseMidpoint = MICRO_11_TIMELINE.streamCollapse.at + MICRO_11_TIMELINE.streamCollapse.duration / 2;
const collapsing = at(collapseMidpoint);
assert.ok(collapsing.streamHeightScale > 0 && collapsing.streamHeightScale < 1);
near(CELL * collapsing.contentScale * collapsing.streamHeightScale / (2 * collapsing.agentRadius), collapsing.streamHeightScale);
assert.notEqual(collapsing.streamPhase, at(collapseMidpoint + .01).streamPhase, 'streaming continues during collapse');
const end = at(8);
near(end.camera.x, 640);
near(end.camera.scale * BIG_GRID.pitch, 100);
near(end.agentRadius * end.camera.scale * 2, 12);
assert.equal(end.streamHeightScale, 0);
assert.equal(end.smallGridOpacity, 0);
assert.equal(end.loaderOpacity, 0);
assert.equal(BIG_GRID_CELLS.length, 135);
assert.equal(BIG_GRID_CELLS.filter(cell => cell.hero).length, 1);
assert.deepEqual(at(collapseMidpoint), collapsing, 'random-access sampling is deterministic');
assert.equal(start.dotColor, 'rgb(255, 255, 255)');
const dimMidpoint = MICRO_11_TIMELINE.dotDim.at + MICRO_11_TIMELINE.dotDim.duration / 2;
assert.ok(Math.abs(sampleMicro11Transition(dimMidpoint).dotDim - .5) < .001);
assert.notEqual(at(dimMidpoint).dotColor, start.dotColor);
assert.notEqual(at(dimMidpoint).dotColor, end.dotColor);
assert.equal(end.dotColor, 'rgb(78, 78, 78)');
assert.equal(new Set(start.cells.map(cell => cell.offset)).size, BIG_GRID_CELLS.length);
const otherSeed = sampleMicro11(0, {...MICRO_11_DEFAULTS, streamSeed: 210});
assert.notEqual(start.cells[0].offset, otherSeed.cells[0].offset);
for (const [index, cell] of start.cells.entries()) {
  assert.ok(cell.offset >= 0 && cell.offset < STREAM_PERIOD);
  near(cell.streamPhase % CELL, cell.gridPhase);
  near(cell.offset, at(5.2).cells[index].offset);
  near(at(.1).cells[index].streamPhase, (cell.streamPhase + .1 * MICRO_11_DEFAULTS.streamerSpeed) % STREAM_PERIOD);
}
console.log('Micro11: shared scaling, seeded stream offsets, dot dimming, and deterministic timeline passed.');
