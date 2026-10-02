import assert from 'node:assert/strict';
import test from 'node:test';
import {cellCenter} from '../micro-14/geometry';
import {sampleMicro16} from '../micro-16/sample';
import {HERO_CELL, sampleMicro20} from './sample';
import {PRELUDE_TIMING} from './timeline';

const prelude = (time: number) => {
  const value = sampleMicro20(time);
  assert.notEqual(value.phase, 'issues');
  if (value.phase === 'issues') throw new Error('Expected prelude');
  return value;
};
test('spinner has no angular reset at the actual zoom boundary', () => {
  const before = prelude(3.45), after = prelude(3.45001);
  const delta = ((after.hero.angle - before.bashAgent.angle + 180) % 360 + 360) % 360 - 180;
  assert.ok(Math.abs(delta) < .01, `angular jump ${delta}`);
});
test('default spinner preserves Animation16 overlapping entry/stop phase before the new descent reversal', () => {
  for (const time of [1.15, 1.2, 1.3, 1.35]) {
    const source = sampleMicro16(time, undefined, {
      purpleBashEntry: PRELUDE_TIMING.blueBashEntry,
      purpleBashStop: PRELUDE_TIMING.blueBashStop,
      bashDescent: PRELUDE_TIMING.bashDescent,
    });
    assert.ok(Math.abs(prelude(time).bashAgent.angle - source.bashAgent.angle) < 1e-9);
  }
});
test('agent belongs to the same real cell used for the occupancy exception', () => {
  const sample = prelude(5.5);
  const dot = sample.dots.find(dot => dot.cell === HERO_CELL)!;
  assert.equal(sample.hero.x, dot.x);
  assert.equal(sample.hero.y, dot.y);
});
test('zero circle radius cannot discover warnings', () => {
  const sample = sampleMicro20(7.45, {radialCircleRadius: 0});
  if (sample.phase === 'issues') throw new Error('Expected prelude');
  assert.ok(sample.warnings.every(warning => warning.scale === 0));
});
