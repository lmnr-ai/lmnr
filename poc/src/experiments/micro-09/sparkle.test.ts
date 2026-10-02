import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {sampleSparkleGrid, spatialTriangleProbabilities, SPARKLE_DEFAULTS} from './sparkle';

test('Animation9 output remains byte-identical to pre-topology-extension fixtures', () => {
  // SHA256 of JSON output captured from the original kernel before editing it.
  const fixtures = [
    [-1, 209, 'b4a27d02fe3c6c62c180e5c9b93ddc2859fb3e619ce45d1bcda57e6ac869430e'],
    [0, 0, '8555fa536d6d33a25b9b6ca20738f55a60df1bfecf95f71ff371572954298553'],
    [.25, 209, '56c4b495df38de3691c0c108f7e9254acc7182c5f6f7e4df63514d6625760092'],
    [1, 209, '9af52d6b4a65e5f226c94d762abdd0a7dad050c665030d3ceb759235e40ceba9'],
    [2, 701, '1a9b7be7d4681d67a1af80eb683811140a9f1c4c08164bf546db446f7dfb842b'],
    [5, 209, '28070624fa4b1cf52462f702d99d66b21a5edb86e3a8948ae393a6ca95cc2414'],
    [10, 17, '1d397e21dc1e53ccf5109bfd55bf7d774b2ffaa75d25451fac4cb5d03e946094'],
  ] as const;
  for (const [time, seed, hash] of fixtures) assert.equal(createHash('sha256').update(JSON.stringify(sampleSparkleGrid(time, seed))).digest('hex'), hash);
});
test('rectangular topology keeps four-edge isolation and exact expected density', () => {
  const topology = {columns: 5, rows: 3};
  const states = Array.from({length: 15}, (_, i) => i === 7);
  const probabilities = spatialTriangleProbabilities(states, .2, 9.25, topology);
  assert.ok(Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 3) < 1e-12);
  assert.ok(probabilities[2] < probabilities[1]);
  assert.equal(probabilities[1], probabilities[3], 'diagonals are not neighbors');
  assert.equal(probabilities[6], probabilities[8]);
  assert.ok(probabilities[2] < probabilities[6], 'boundary neighbor count is normalized');
  const initial = sampleSparkleGrid(0, 209, SPARKLE_DEFAULTS, {topology});
  assert.deepEqual(sampleSparkleGrid(0, 209, SPARKLE_DEFAULTS, {topology, cells: initial}), initial);
  assert.deepEqual(sampleSparkleGrid(1, 209, SPARKLE_DEFAULTS, {topology, cells: initial}), sampleSparkleGrid(1, 209, SPARKLE_DEFAULTS, {topology}));
});
