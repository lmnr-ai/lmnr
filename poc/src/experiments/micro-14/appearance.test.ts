import assert from 'node:assert/strict';
import {warningAppearanceTiming} from './appearance';
import {CLUSTERS, TOKEN_BY_ID} from './geometry';
import {getDispersionHistory} from './dispersion';
import {sampleMicro14} from './sample';
import {MICRO_14_DEFAULTS, MICRO_14_TIMING} from './timeline';

const controls = {...MICRO_14_DEFAULTS};
const timing = MICRO_14_TIMING;
const start = sampleMicro14(0, controls);
assert.equal(Object.keys(start.warningAppearance).length, 47, 'all grouped warnings and the singleton appear from dots');
assert.ok(Object.values(start.warningAppearance).every(progress => progress === 0), 'initial scene has dots, not warnings');
const middle = sampleMicro14(.4, controls);
assert.ok(Object.values(middle.warningAppearance).some(progress => progress === 0));
assert.ok(Object.values(middle.warningAppearance).some(progress => progress > 0 && progress < 1));
assert.ok(Object.values(middle.warningAppearance).some(progress => progress === 1), 'cells transition at different times');
assert.deepEqual(middle.tokens, start.tokens, 'appearance never moves the initial occupants');
const completeAt = timing.appearance.at + timing.appearance.duration;
assert.ok(completeAt <= timing.swapping.at, 'default appearance completes before swapping');
assert.ok(Object.values(sampleMicro14(completeAt, controls).warningAppearance).every(progress => progress === 1));
assert.deepEqual(sampleMicro14(completeAt, controls).tokens, start.tokens);

const history = getDispersionHistory(controls.seed, controls.dispersionFrames, controls.swapProbability, controls.smallClusterDelay);
for (const [cell, id] of history.states[history.frames].entries()) {
  if (TOKEN_BY_ID.get(id)!.kind !== 'warning') continue;
  const clip = warningAppearanceTiming(controls.seed, cell, timing.appearance, controls.warningAppearanceDuration);
  assert.ok(clip.at >= timing.appearance.at && clip.at + clip.duration <= completeAt);
  assert.equal(sampleMicro14(clip.at, controls).warningAppearance[id], 0);
  assert.ok(Math.abs(sampleMicro14(clip.at + clip.duration / 2, controls).warningAppearance[id] - .5) < 1e-8);
  assert.ok(Math.abs(sampleMicro14(clip.at + clip.duration, controls).warningAppearance[id] - 1) < 1e-8);
  const retimed = warningAppearanceTiming(controls.seed, cell, {at: 2, duration: 3}, controls.warningAppearanceDuration);
  assert.ok(Math.abs((clip.at - timing.appearance.at) / (timing.appearance.duration - clip.duration)
    - (retimed.at - 2) / (3 - retimed.duration)) < 1e-8, 'retiming preserves seeded cell order');
}
assert.notDeepEqual(warningAppearanceTiming(209, 10, timing.appearance, .25), warningAppearanceTiming(210, 10, timing.appearance, .25));
sampleMicro14(12, controls); sampleMicro14(.7, controls); sampleMicro14(0, controls);
assert.deepEqual(sampleMicro14(.4, controls), middle, 'rewinding is deterministic');
const instant = {...timing, appearance: {at: .5, duration: 0}};
assert.ok(Object.values(sampleMicro14(.49, controls, instant).warningAppearance).every(progress => progress === 0));
assert.ok(Object.values(sampleMicro14(.5, controls, instant).warningAppearance).every(progress => progress === 1));
const shortened = {...timing, appearance: {at: .1, duration: .1}};
assert.ok(Object.values(sampleMicro14(.21, {...controls, warningAppearanceDuration: 2}, shortened).warningAppearance).every(progress => progress === 1), 'transition duration is capped to the segment');
const assembledControls = {...controls, dispersionFrames: 0};
for (const cluster of CLUSTERS) {
  const readyAt = sampleMicro14(0, assembledControls).clusters[cluster.id].readyAt;
  assert.ok(readyAt > 0 && readyAt <= completeAt, 'already assembled groups wait only for their own warnings to appear');
  assert.equal(sampleMicro14(readyAt - .001, assembledControls).clusters[cluster.id].clusterBackgroundOpacity, 0);
  assert.ok(sampleMicro14(readyAt + .001, assembledControls).clusters[cluster.id].clusterBackgroundOpacity > 0);
}
console.log('Micro14 appearance: seeded per-cell onset, complementary dot/triangle scales, clip bounds, retiming, rewind, zero duration, singleton, and formation-triggered covers passed.');
