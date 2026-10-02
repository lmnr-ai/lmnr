import assert from 'node:assert/strict';
import {getDispersionHistory} from './dispersion';
import {CLUSTERS, TOKEN_BY_ID, cellIndex} from './geometry';
import {sampleMicro14} from './sample';
import {MICRO_14_DEFAULTS, MICRO_14_TIMING, MICRO_14_TIMELINE, normalizeTiming} from './timeline';

// Reproduce the real persisted v2 settings, not just newly reset defaults.
const controls = {...MICRO_14_DEFAULTS};
const savedTiming = {...MICRO_14_TIMING,
  smallWarningShrink: {at: 10.8, duration: .8},
  clusterBackgroundFade: {at: 10.8, duration: .8},
  largeWarningGrow: {at: 10.8, duration: .8},
};
const readyAt = sampleMicro14(0, controls, savedTiming).clusters['green-2'].readyAt;
const afterArrival = sampleMicro14(readyAt + .01, controls, savedTiming);
assert.ok(afterArrival.clusters['green-2'].clusterBackgroundOpacity > 0,
  'formed group must begin its warning cover immediately, even with saved 10.8s merge clips');
assert.ok(afterArrival.clusters['green-2'].largeWarningScale > 0);
assert.equal(afterArrival.clusters['pink-4'].largeWarningScale, 0, 'other groups can still be gathering');
assert.deepEqual(Object.keys(MICRO_14_TIMELINE), ['appearance', 'swapping'], 'obsolete global merge tracks are removed');
assert.deepEqual(normalizeTiming(savedTiming), MICRO_14_TIMING, 'old saved merge values cannot affect the cover');
assert.deepEqual(afterArrival, sampleMicro14(readyAt + .01, controls), 'saved obsolete timing is ignored without resetting user storage');

// A complete square means group occupancy, not that interchangeable warnings
// have all returned to their original identity slots. First completion must stick.
for (const seed of [0, 1, 209, 731]) {
  for (const delay of [0, .6, .95]) {
    const settings = {...controls, seed, smallClusterDelay: delay};
    const history = getDispersionHistory(seed, settings.dispersionFrames, settings.swapProbability, delay);
    for (const cluster of CLUSTERS) {
      const cells = Array.from({length: cluster.size ** 2}, (_, index) =>
        cellIndex(cluster.column + index % cluster.size, cluster.row + Math.floor(index / cluster.size)));
      let firstComplete = -1;
      for (let step = 0; step <= history.frames; step++) {
        const state = history.states[history.frames - step];
        const complete = cells.every(cell => TOKEN_BY_ID.get(state[cell])!.clusterId === cluster.id);
        if (complete && firstComplete === -1) firstComplete = step;
        if (firstComplete !== -1) assert.ok(complete, 'once formed, a square must never disperse again');
      }
      assert.equal(history.clusterReadySteps[cluster.id], firstComplete, 'cover readiness must be the first complete square, not a later identity-sorting step');
      const arrival = sampleMicro14(0, settings, savedTiming).clusters[cluster.id].readyAt;
      const before = sampleMicro14(Math.max(0, arrival - .001), settings, savedTiming).clusters[cluster.id];
      assert.equal(before.clusterBackgroundOpacity, 0, 'no cover while members are still arriving');
      const after = sampleMicro14(arrival + .01, settings, savedTiming).clusters[cluster.id];
      assert.ok(after.clusterBackgroundOpacity > 0 && after.largeWarningScale > 0, 'cover animation starts with formation, not when all swaps end');
    }
  }
}
// Low swap probability exposes brief re-formations that a dense walk can hide.
// Seed 5 previously re-formed yellow-2, then broke it apart again in reverse.
for (let seed = 0; seed < 150; seed++) {
  const history = getDispersionHistory(seed, 10, .1, 0);
  for (const cluster of CLUSTERS) {
    const cells = Array.from({length: cluster.size ** 2}, (_, index) =>
      cellIndex(cluster.column + index % cluster.size, cluster.row + Math.floor(index / cluster.size)));
    let firstComplete = -1;
    for (let step = 0; step <= history.frames; step++) {
      const state = history.states[history.frames - step];
      const complete = cells.every(cell => TOKEN_BY_ID.get(state[cell])!.clusterId === cluster.id);
      if (complete && firstComplete === -1) firstComplete = step;
      if (firstComplete !== -1) assert.ok(complete, `seed ${seed}: ${cluster.id} must not split after formation`);
    }
    assert.equal(history.clusterReadySteps[cluster.id], firstComplete);
  }
}
console.log('Micro14 warning cover: saved timing regression, removed merge tracks, immediate per-group onset, first square completion, and 150-seed no-re-dispersion check passed.');
