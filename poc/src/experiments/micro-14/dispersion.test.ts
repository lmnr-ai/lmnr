import assert from 'node:assert/strict';
import {CELL_COUNT, CLUSTERS, GRID, INTERMEDIATE_STATE, TOKENS} from './geometry';
import {MAX_DISPERSION_FRAMES, clusterDispersionStart, createDispersionHistory, getDispersionHistory} from './dispersion';

const settings = {seed: 209, frames: 90, probability: .62};
const history = createDispersionHistory(settings.seed, settings.frames, settings.probability);
assert.deepEqual(history, createDispersionHistory(settings.seed, settings.frames, settings.probability), 'separate generation is deterministic');
assert.notDeepEqual(history.states.at(-1), createDispersionHistory(210, settings.frames, settings.probability).states.at(-1), 'representative seeds disperse differently');
const ids = [...INTERMEDIATE_STATE].sort();
assert.equal(TOKENS.length, 216);
for (const state of history.states) {
  assert.equal(state.length, CELL_COUNT);
  assert.deepEqual([...state].sort(), ids, 'every state is a complete 216-token permutation');
}
const directions = new Set<string>();
for (const [batchIndex, batch] of history.batches.entries()) {
  const endpoints = new Set<number>();
  for (const [from, to] of batch) {
    assert.ok(from >= 0 && from < CELL_COUNT && to >= 0 && to < CELL_COUNT);
    assert.ok(!endpoints.has(from) && !endpoints.has(to), 'batch endpoints are unique');
    endpoints.add(from); endpoints.add(to);
    const dc = to % GRID.columns - from % GRID.columns;
    const dr = Math.floor(to / GRID.columns) - Math.floor(from / GRID.columns);
    assert.ok(Math.max(Math.abs(dc), Math.abs(dr)) === 1, 'swap is a non-wrapping 8-neighbor move');
    directions.add(`${Math.sign(dc)},${Math.sign(dr)}`);
    const before = history.states[batchIndex];
    assert.ok(TOKENS[Number(before[from].slice(5))].kind !== 'dot' || TOKENS[Number(before[to].slice(5))].kind !== 'dot', 'a gray dot must NEVER swap with another gray dot');
    const after = history.states[batchIndex + 1];
    assert.equal(after[to], before[from]); assert.equal(after[from], before[to]);
  }
  const beforePosition = new Map(history.states[batchIndex].map((id, index) => [id, index]));
  history.states[batchIndex + 1].forEach((id, index) => {
    const prior = beforePosition.get(id)!;
    assert.ok(Math.abs(index % GRID.columns - prior % GRID.columns) <= 1);
    assert.ok(Math.abs(Math.floor(index / GRID.columns) - Math.floor(prior / GRID.columns)) <= 1);
  });
}
assert.deepEqual([...directions].sort(), ['-1,-1','-1,0','-1,1','0,-1','0,1','1,-1','1,0','1,1'], 'suite exercises all eight directions');
for (let inverseStep = 0; inverseStep < history.frames; inverseStep++) {
  const later = history.states[history.frames - inverseStep];
  const earlier = history.states[history.frames - inverseStep - 1];
  const earlierPosition = new Map(earlier.map((id, index) => [id, index]));
  later.forEach((id, index) => {
    const target = earlierPosition.get(id)!;
    assert.ok(Math.max(Math.abs(index % GRID.columns - target % GRID.columns), Math.abs(Math.floor(index / GRID.columns) - Math.floor(target / GRID.columns))) <= 1);
  });
}
let reversed = [...history.states.at(-1)!];
for (let batchIndex = history.batches.length - 1; batchIndex >= 0; batchIndex--) {
  for (const [from, to] of history.batches[batchIndex]) [reversed[from], reversed[to]] = [reversed[to], reversed[from]];
  assert.deepEqual(reversed, history.states[batchIndex], 'replaying the exact saved batch backward reconstructs its prior state');
}
assert.deepEqual(reversed, INTERMEDIATE_STATE, 'full reverse reaches the exact original including dots');
const metadataCounts = (state: readonly string[]) => state.reduce((counts, id) => {
  const token = TOKENS[Number(id.slice(5))];
  const key = token.kind === 'dot' ? 'dot' : `${token.color}:${token.clusterId ?? 'singleton'}`;
  counts.set(key, (counts.get(key) ?? 0) + 1); return counts;
}, new Map<string, number>());
const expectedCounts = metadataCounts(INTERMEDIATE_STATE);
for (const state of history.states) assert.deepEqual(metadataCounts(state), expectedCounts, 'kind, color, and cluster counts travel with identities');
for (const frames of [0, 1, settings.frames, MAX_DISPERSION_FRAMES]) {
  assert.equal(createDispersionHistory(7, frames, .5).states.length, frames + 1);
}
const zero = createDispersionHistory(5, MAX_DISPERSION_FRAMES, 0);
assert.ok(zero.batches.every(batch => batch.length === 0));
assert.ok(zero.states.every(state => state.every((id, index) => id === INTERMEDIATE_STATE[index])));
const one = createDispersionHistory(5, MAX_DISPERSION_FRAMES, 1);
assert.ok(one.batches.some(batch => batch.length > 0));
for (const batch of one.batches) assert.equal(new Set(batch.flat()).size, batch.length * 2);
const cachedMiddle = getDispersionHistory(13, 50, .5).states[25];
getDispersionHistory(2, 2, 1); getDispersionHistory(3, 3, 1);
assert.deepEqual(getDispersionHistory(13, 50, .5).states[25], cachedMiddle, 'cached random access is call-order independent');
assert.ok(Object.isFrozen(history.states) && Object.isFrozen(history.states[0]) && Object.isFrozen(history.batches[0]), 'history is immutable');
for (const delay of [0, .6, .95]) {
  const staggered = createDispersionHistory(209, 90, 1, delay);
  assert.deepEqual(staggered, createDispersionHistory(209, 90, 1, delay));
  for (const [frame, batch] of staggered.batches.entries()) {
    assert.equal(new Set(batch.flat()).size, batch.length * 2, 'staggered batches remain disjoint');
    const before = staggered.states[frame];
    const after = [...before];
    for (const [from, to] of batch) {
      assert.ok(TOKENS[Number(before[from].slice(5))].kind !== 'dot' || TOKENS[Number(before[to].slice(5))].kind !== 'dot', 'no dot-dot swaps at any delay');
      assert.equal(Math.max(Math.abs(from % GRID.columns - to % GRID.columns), Math.abs(Math.floor(from / GRID.columns) - Math.floor(to / GRID.columns))), 1);
      [after[from], after[to]] = [after[to], after[from]];
    }
    assert.deepEqual(after, staggered.states[frame + 1]);
    for (const cluster of CLUSTERS) {
      if (frame >= clusterDispersionStart(cluster.size, 90, delay)) continue;
      for (const token of TOKENS.filter(token => token.clusterId === cluster.id)) {
        const original = INTERMEDIATE_STATE.indexOf(token.id);
        assert.equal(staggered.states[frame + 1][original], token.id, 'locked groups cannot move as source OR destination');
      }
    }
  }
  assert.deepEqual([...staggered.states.at(-1)!].sort(), ids);
}
const staggered = getDispersionHistory(209, 90, .62, .6);
assert.notDeepEqual(staggered.states, getDispersionHistory(209, 90, .62, 0).states, 'cache includes delay');
for (const size of [2, 3, 4]) assert.equal(clusterDispersionStart(size, 90, .6), size === 2 ? 54 : size === 3 ? 27 : 0);
for (const seed of [0, 209, 731]) {
  for (const probability of [0, .62, 1]) {
    const tested = createDispersionHistory(seed, 90, probability, .6);
    for (const [frame, batch] of tested.batches.entries()) {
      for (const [from, to] of batch) {
        const kind = (index: number) => TOKENS[Number(tested.states[frame][index].slice(5))].kind;
        assert.ok(kind(from) !== 'dot' || kind(to) !== 'dot');
      }
    }
    for (const cluster of CLUSTERS) {
      const members = TOKENS.filter(token => token.clusterId === cluster.id);
      const ready = tested.clusterReadySteps[cluster.id];
      for (let reverse = ready; reverse <= tested.frames; reverse++) {
        const state = tested.states[tested.frames - reverse];
        for (const member of members) assert.equal(state[Number(member.id.slice(5))], member.id, 'every member stays home after ready step');
      }
      if (ready > 0) {
        const before = tested.states[tested.frames - ready + 1];
        assert.ok(members.some(member => before[Number(member.id.slice(5))] !== member.id), 'ready step is the earliest permanently settled step');
      }
    }
  }
}
assert.ok(Object.isFrozen(staggered.clusterReadySteps));
console.log('Micro14 dispersion: no dot-dot swaps, deterministic reversal, disjoint neighbors, delayed locks, earliest settlement, and cache passed.');
