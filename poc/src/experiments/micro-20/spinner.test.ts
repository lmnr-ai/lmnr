import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleMicro20, sampleMicro20Frame} from './sample';
import {MICRO_20_DEFAULTS, PRELUDE_TIMING} from './timeline';

const angle = (time: number, controls: Record<string, number> = {}) => {
  const sample = sampleMicro20(time, {...MICRO_20_DEFAULTS, ...controls});
  if (sample.phase === 'issues') throw new Error('Expected blue agent');
  return sample.hero.angle;
};
const velocity = (time: number, controls: Record<string, number> = {}) => (angle(time + .00001, controls) - angle(time, controls)) / .00001;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const stages = [
  ['spinnerEntrySpeed', .7, 1], ['spinnerStopSpeed', 1.3, 1],
  ['spinnerDescentSpeed', 2, -1], ['spinnerZoomSpeed', 4, 1],
  ['spinnerAnalysisSpeed', 6, 1],
] as const;
test('descent reverses direction; five speed dials independently control actual angular velocity', () => {
  for (const [key, time, sign] of stages) {
    close(velocity(time), sign * 1.9 * 360);
    close(velocity(time, {[key]: .7}), sign * .7 * 360);
    close(velocity(time, {[key]: 0}), 0);
    for (const [other, otherTime, otherSign] of stages) if (other !== key) {
      close(velocity(otherTime, {[key]: .7}), otherSign * 1.9 * 360);
    }
  }
});
test('integrated phase is continuous at all stage boundaries and holds between motion windows', () => {
  for (const time of [.4, 1.1, 1.15, 1.45, 1.6, 1.65, 3.29, 3.45, 5.45, 8]) {
    assert.ok(Math.abs(angle(time + 1e-7) - angle(time - 1e-7)) < .001, `reset at ${time}`);
  }
  close(velocity(.2), 0); close(velocity(3.35), 0); close(velocity(8.1), 0);
  close(velocity(1.61), -1.9 * 360); // Descent wins overlap with opening.
  close(angle(.3, {spinnerEntrySpeed: 8}), angle(.3));
  close(angle(6, {spinnerDescentSpeed: .9}) - angle(6), PRELUDE_TIMING.bashDescent.duration * 360);
});
test('stage edits, retiming, reverse seeks and serialized frame sampling remain deterministic', () => {
  const controls = {...MICRO_20_DEFAULTS, spinnerEntrySpeed: .3, spinnerStopSpeed: .6, spinnerDescentSpeed: 2.1, spinnerZoomSpeed: .8, spinnerAnalysisSpeed: 1.2};
  const timing = {...PRELUDE_TIMING, bashDescent: {...PRELUDE_TIMING.bashDescent, at: 2.1}};
  for (const time of [6, 2.3, 1.4, 4, 0, 6]) {
    const sampled = sampleMicro20(time, controls, timing);
    sampleMicro20(0); sampleMicro20(9);
    assert.deepEqual(sampleMicro20(time, controls, timing), sampled);
    assert.deepEqual(sampleMicro20Frame(time * 30, JSON.parse(JSON.stringify(controls)), JSON.parse(JSON.stringify(timing))), sampled);
  }
});
