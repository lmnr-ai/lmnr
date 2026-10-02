import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleMicro20} from './sample';
import {PRELUDE_TIMING, type PreludeTiming} from './timeline';

function prelude(time: number, timing: Partial<PreludeTiming> = PRELUDE_TIMING) {
  const s = sampleMicro20(time, undefined, timing);
  assert.notEqual(s.phase, 'issues');
  if (s.phase === 'issues') throw Error('Expected prelude');
  return s;
}
test('detection marker pops with highlighting, then shrinks away during pullback', () => {
  assert.equal(prelude(2.85).detectionWarning.scale, 0);
  assert.ok(prelude(2.9).detectionWarning.scale > 0);
  assert.equal(prelude(3.1).detectionWarning.scale, 1);
  assert.equal(prelude(3.45).detectionWarning.scale, 1);
  const scales = [3.45, 3.6, 3.8, 4, 4.2, 5.45].map(t => prelude(t).detectionWarning.scale);
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] <= scales[i - 1]);
  assert.equal(scales.at(-1), 0);
  assert.equal(prelude(6.5).detectionWarning.scale, 0);
});
test('authored highlighting endpoints, instant clips and retiming control detection', () => {
  const delayed = {...PRELUDE_TIMING, bashHighlight: {...PRELUDE_TIMING.bashHighlight, at: 6, duration: 0}};
  assert.equal(prelude(5, delayed).detectionWarning.scale, 0);
  assert.equal(prelude(6, delayed).detectionWarning.scale, 1);
  const muted = {...PRELUDE_TIMING, bashHighlight: {...PRELUDE_TIMING.bashHighlight, to: {progress: 0}}};
  assert.equal(prelude(3.4, muted).detectionWarning.scale, 0);
  const instantZoom = {...PRELUDE_TIMING, analysisZoomOut: {...PRELUDE_TIMING.analysisZoomOut, duration: 0}};
  assert.equal(prelude(3.45, instantZoom).detectionWarning.scale, 0);
});
test('warning is not a camera target; hero stays at world origin and centered macro cell', () => {
  for (const time of [2.9, 3.4, 3.6, 4, 5, 5.45, 6.5]) {
    const s = prelude(time);
    const hidden = prelude(time, {...PRELUDE_TIMING, bashHighlight: {...PRELUDE_TIMING.bashHighlight, to: {progress: 0}}});
    assert.deepEqual(s.hero, hidden.hero);
    assert.deepEqual(s.origin, hidden.origin);
    assert.equal(s.cameraScale, hidden.cameraScale);
    assert.equal(s.hero.x, s.origin.x); assert.equal(s.hero.y, s.origin.y);
    assert.equal(s.detectionWarning.x, -67.6015); assert.equal(s.detectionWarning.y, -55.698);
  }
  const settled = prelude(5.45);
  assert.equal(settled.hero.x, 640); assert.equal(settled.hero.y, 360);
});
test('arbitrary reverse seeks reproduce detection and world state exactly', () => {
  const times = [0, 3, 3.4, 3.8, 5.45, 6.5];
  const snapshots = times.map(t => prelude(t));
  for (let i = times.length - 1; i >= 0; i--) assert.deepEqual(prelude(times[i]), snapshots[i]);
});
