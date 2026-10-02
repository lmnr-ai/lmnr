import assert from 'node:assert/strict';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {BAYER_8, DITHER_DEFAULTS, DITHER_LOOP_SECONDS, cloudImageRect, ditherAtProgress, sameDither, sampleDither} from './dither';
import {MICRO_08_DURATION, MICRO_08_TIMELINE} from './timeline';
import {sampleMicro08} from './sample';

assert.equal(DITHER_LOOP_SECONDS, 8);
assert.ok(MICRO_08_DURATION > DITHER_LOOP_SECONDS, 'composition now includes a finite outro');
assert.deepEqual([...BAYER_8].sort((a, b) => a - b), Array.from({length: 64}, (_, i) => i));
const times = [0, 1 / 30, 2, 3.99, 4, 7.99, 8, -8, -.125, 86400.125, 1e12 + .125];
const animated = {...DITHER_DEFAULTS, pulse: .6};
for (const time of times) {
  assert.deepEqual(sampleDither(time), sampleDither(0), 'static by default: transport does not cause shader work');
  assert.ok(Math.abs(sampleDither(time, animated).intensity - sampleDither(time + 8, animated).intensity) < 1e-12);
  assert.ok(Object.values(sampleDither(time, animated)).every(Number.isFinite));
  assert.equal(sampleDither(time, {...animated, intensity: 0}).intensity, 0, 'zero intensity stays bypassed');
}
assert.deepEqual(sampleDither(0, animated), sampleDither(8, animated));
assert.notDeepEqual(sampleDither(0, animated), sampleDither(4, animated));
assert.deepEqual(sampleMicro08(0), sampleMicro08(8));
assert.deepEqual(times.map(sampleMicro08), [...times].reverse().map(sampleMicro08).reverse(), 'reverse seeks');
assert.deepEqual(sampleDither(.125, animated), sampleDither(1e12 + .125, animated));
assert.ok(sameDither(sampleDither(0), sampleDither(3)));
assert.ok(!sameDither(sampleDither(0), {...sampleDither(0), pixelSize: DITHER_DEFAULTS.pixelSize + 1}));
assert.ok(!sameDither(sampleDither(0), {...sampleDither(0), colorLevels: 4}));
assert.ok(!sameDither(sampleDither(0), {...sampleDither(0), contrast: 2}));
assert.ok(!sameDither(sampleDither(0), {...sampleDither(0), intensity: .5}));
// Optional pulse returns to the same value and velocity; no time-reset jump.
const epsilon = .0001;
const before = sampleDither(8 - epsilon, animated).intensity;
const center = sampleDither(0, animated).intensity;
const after = sampleDither(epsilon, animated).intensity;
assert.ok(Math.abs(after - before) < 1e-10);
assert.ok(Math.abs((center - before) / epsilon - (after - center) / epsilon) < .0001);
const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_08_TIMELINE), {});
for (const time of [0, .5, 2, 4, 7.9, 8]) {
  const {current} = computeClipState(clips.find(clip => clip.key === 'dither')!, time, time) as {current: {progress: number}};
  assert.ok(Math.abs(ditherAtProgress(current.progress, animated).intensity - sampleDither(time, animated).intensity) < 1e-10, 'DialKit/sample parity');
}
const rect = cloudImageRect(623, 350);
assert.equal(rect.y, -104);
assert.equal(rect.height, 1072);
assert.ok(Math.abs(rect.width / rect.height - 623 / 350) < 1e-12, 'no image stretching');
assert.ok(Math.abs(rect.x + rect.width / 2 - (383 + 1908 / 2)) < 1e-10, 'original center retained');
assert.ok(rect.width >= 1908, 'matches SVG slice crop');
console.log('Micro08 cloud: static default, optional pulse closure/velocity, reverse/large seeks, Figma placement and DialKit parity passed.');
