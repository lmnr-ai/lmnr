import assert from 'node:assert/strict';
import test from 'node:test';
import {cellCoordinates, CLUSTERS} from '../micro-14/geometry';
import {sampleMicro15} from '../micro-15/sample';
import {START_CELLS} from '../micro-15/starting-positions';
import {sampleMicro20} from './sample';
import {effectiveIssueStart, MICRO_20_DEFAULTS, MICRO_20_ISSUE_DEFAULTS, MICRO_20_ISSUE_TIMING, PRELUDE_TIMING} from './timeline';

const prelude = (time: number) => {
  const s = sampleMicro20(time);
  if (s.phase === 'issues') throw new Error('Expected prelude');
  return s;
};
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test('odd grid: independent continuous 120→54 hero, unchanged 12px ground dots', () => {
  for (const time of [3.45, 4, 4.45, 5, 5.5]) {
    const s = prelude(time);
    close(s.hero.scale * 120, 120 * (54 / 120) ** s.zoom);
    close(s.dots[0].radius * 2, 120 * 10 ** -s.zoom);
  }
  close(prelude(5.5).hero.scale * 120, 54);
});
test('odd grid: exactly 17 columns, 204 cells and centered col8 row5; no late displacement', () => {
  for (const time of [5.5, 7.25, 7.375, 7.499999]) {
    const s = prelude(time);
    assert.equal(s.dots.length, 204);
    assert.equal(new Set(s.dots.map(d => d.x)).size, 17);
    const center = s.dots.find(d => d.x === 640 && d.y === 360)!;
    assert.ok(center);
    assert.deepEqual(cellCoordinates(center.cell), {column: 9, row: 5});
    assert.equal(Object.values(START_CELLS).includes(center.cell), false);
    assert.deepEqual(s.origin, {x: 640, y: 360});
  }
});
test('odd grid: world mapping translates all warnings, ground and clusters; UI/state machines unchanged', () => {
  for (const local of [0, 7, 1.2, 4.5, .8, 5.8, 0]) {
    const s = sampleMicro20(effectiveIssueStart(PRELUDE_TIMING) + local);
    if (s.phase !== 'issues') throw new Error('Default scan must complete');
    const source = sampleMicro15(local, MICRO_20_ISSUE_DEFAULTS, MICRO_20_ISSUE_TIMING);
    const world = s.issueWorld;
    assert.ok(world, 'mapped world is the render source of truth');
    assert.deepEqual(world.translation, {x: -39.5, y: 2.5});
    assert.equal(world.groundDots.length, 204);
    for (const dot of world.groundDots) {
      const original = source.groundDots.find(d => d.cell === dot.cell)!;
      assert.notEqual(cellCoordinates(dot.cell).column, 0);
      close(dot.x, original.x - 39.5); close(dot.y, original.y + 2.5);
      assert.equal(dot.scale, original.scale);
    }
    for (const token of world.warnings) {
      const original = source.tokens.find(t => t.token.id === token.token.id)!;
      close(token.x, original.x - 39.5); close(token.y, original.y + 2.5);
    }
    assert.equal(world.warnings.length, 47);
    for (const cluster of world.clusters) {
      const original = CLUSTERS.find(c => c.id === cluster.id)!;
      assert.equal(cluster.column, original.column - 1);
      close(cluster.x, original.x - 39.5); close(cluster.y, original.y + 2.5);
    }
    assert.deepEqual(s.issue.agent, source.agent);
    assert.deepEqual(s.issue.clusters, source.clusters);
    assert.deepEqual(s.issue.tokens, source.tokens);
  }
});
test('odd grid: no layout movement even for authored gate progress', () => {
  for (const progress of [0, .2, .5, 1]) {
    const s = sampleMicro20(7.4, MICRO_20_DEFAULTS, {...PRELUDE_TIMING, analysisLayout: {...PRELUDE_TIMING.analysisLayout, from: {progress}, to: {progress}}});
    if (s.phase === 'issues') throw new Error('Expected prelude');
    assert.deepEqual(s.origin, {x: 640, y: 360});
  }
});
