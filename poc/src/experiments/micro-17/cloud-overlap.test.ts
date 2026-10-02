import assert from 'node:assert/strict';
import test from 'node:test';
import {worldState} from './geometry';
import {sampleMicro17} from './sample';
import {DEFAULT_TIMING, normalizeTiming, timingWarnings} from './timeline';

test('default cloud entry overlaps the last 0.7 seconds of zoom with no ordering warning', () => {
  const zoomEnd = DEFAULT_TIMING.finalZoom.at + DEFAULT_TIMING.finalZoom.duration;
  assert.ok(Math.abs(zoomEnd - DEFAULT_TIMING.cloudEnter.at - .7) < 1e-9);
  const playback = sampleMicro17(zoomEnd - .3);
  assert.ok(playback.progress.finalZoom > 0 && playback.progress.finalZoom < 1);
  assert.ok(playback.progress.cloudEnter > 0 && playback.progress.cloudEnter < 1);
  assert.deepEqual(timingWarnings(DEFAULT_TIMING), []);
});
test('cloud transforms are independent of world zoom, camera rebase and stream position', () => {
  const playback = sampleMicro17(DEFAULT_TIMING.cloudEnter.at + .6);
  const clouds = (s: ReturnType<typeof worldState>) => ({progress: s.cloudProgress, x: s.cloudTranslateX, y: s.cloudTranslateY});
  const expected = clouds(worldState(playback));
  for (const finalZoom of [0, .2, .7, 1]) {
    for (const warningFocus of [0, .5, 1]) {
      assert.deepEqual(clouds(worldState({...playback, progress: {...playback.progress, finalZoom, warningFocus, streamRun: .5}})), expected);
    }
  }
});
test('custom early clouds are allowed; the cloud hold must still follow entry', () => {
  const early = normalizeTiming({cloudEnter: {...DEFAULT_TIMING.cloudEnter, at: DEFAULT_TIMING.finalZoom.at + .2}});
  assert.deepEqual(timingWarnings(early), []);
  const invalidHold = normalizeTiming({...early, cloudHold: {...early.cloudHold, at: early.cloudEnter.at}});
  assert.ok(timingWarnings(invalidHold).includes('Keep cloudHold after cloudEnter.'));
});
