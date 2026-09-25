import {CELL_COUNT, CLUSTERS, GRID, INTERMEDIATE_STATE, TOKEN_BY_ID} from './geometry';

export const MAX_DISPERSION_FRAMES = 240;
export type Swap = readonly [number, number];
export type DispersionHistory = Readonly<{
  seed: number; frames: number; probability: number; smallClusterDelay: number;
  states: readonly (readonly string[])[];
  batches: readonly (readonly Swap[])[];
  // First reverse step with a complete square. Forward re-formation is
  // forbidden, so first completion is permanent and safe to cover.
  clusterReadySteps: Readonly<Record<string, number>>;
}>;

// Mulberry32 is compact, deterministic across JS runtimes, and has no global state.
const makeRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
};
const directions = Object.freeze([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const);
const cache = new Map<string, DispersionHistory>();
const CACHE_LIMIT = 8;
const clampFrames = (frames: number) => Math.max(0, Math.min(MAX_DISPERSION_FRAMES, Math.round(frames)));
const clampProbability = (probability: number) => Math.max(0, Math.min(1, probability));

const clampDelay = (delay: number) => Number.isFinite(delay) ? Math.max(0, Math.min(.95, delay)) : 0;
// Largest groups start immediately; 3x3 groups wait half the dial's delay,
// and 2x2 groups wait the full delay. Lock identities at BOTH swap endpoints.
export const clusterDispersionStart = (size: number, frames: number, delay: number) =>
  Math.floor(frames * clampDelay(delay) * Math.max(0, Math.min(1, (4 - size) / 2)));

export function createDispersionHistory(seed: number, requestedFrames: number, requestedProbability: number, requestedDelay = 0): DispersionHistory {
  const frames = clampFrames(requestedFrames);
  const probability = clampProbability(requestedProbability);
  const smallClusterDelay = clampDelay(requestedDelay);
  const starts = new Map(CLUSTERS.map(cluster => [cluster.id, clusterDispersionStart(cluster.size, frames, smallClusterDelay)]));
  const locked = (id: string, frame: number) => frame < (starts.get(TOKEN_BY_ID.get(id)?.clusterId ?? '') ?? 0);
  const normalizedSeed = Math.round(seed) | 0;
  const random = makeRandom(normalizedSeed);
  const state = [...INTERMEDIATE_STATE];
  const states: (readonly string[])[] = [Object.freeze([...state])];
  const batches: (readonly Swap[])[] = [];
  const clusterReadySteps: Record<string, number> = Object.fromEntries(CLUSTERS.map(cluster => [cluster.id, 0]));
  const homeGroup = INTERMEDIATE_STATE.map(id => TOKEN_BY_ID.get(id)!.clusterId);
  const sizes = new Map(CLUSTERS.map(cluster => [cluster.id, cluster.size ** 2]));
  const homeCounts = new Map(sizes);
  for (let frame = 0; frame < frames; frame++) {
    const order = Array.from({length: CELL_COUNT}, (_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [order[index], order[other]] = [order[other], order[index]];
    }
    const used = new Uint8Array(CELL_COUNT);
    const swaps: Swap[] = [];
    for (const from of order) {
      if (used[from] || locked(state[from], frame) || random() >= probability) continue;
      const [deltaColumn, deltaRow] = directions[Math.floor(random() * directions.length)];
      const column = from % GRID.columns;
      const row = Math.floor(from / GRID.columns);
      const targetColumn = column + deltaColumn;
      const targetRow = row + deltaRow;
      if (targetColumn < 0 || targetColumn >= GRID.columns || targetRow < 0 || targetRow >= GRID.rows) continue;
      const to = targetRow * GRID.columns + targetColumn;
      if (used[to] || locked(state[to], frame)) continue;
      const fromToken = TOKEN_BY_ID.get(state[from])!;
      const toToken = TOKEN_BY_ID.get(state[to])!;
      if (fromToken.kind === 'dot' && toToken.kind === 'dot') continue;
      // Interchangeable warnings must not keep shuffling inside a formed square.
      if (fromToken.clusterId && fromToken.clusterId === toToken.clusterId) continue;
      const nextCounts = [
        {id: fromToken.clusterId, source: from, target: to},
        {id: toToken.clusterId, source: to, target: from},
      ].flatMap(({id, source, target}) => id ? [{id, count: homeCounts.get(id)!
        + Number(homeGroup[target] === id) - Number(homeGroup[source] === id)}] : []);
      // Once dispersed, never fully re-form a square in the FORWARD walk.
      // This makes first reverse completion absorbing without dropping any
      // recorded swaps or introducing a stateful playback-time freeze.
      // Counts include already selected disjoint swaps in this batch.
      if (nextCounts.some(({id, count}) => clusterReadySteps[id] > 0 && count === sizes.get(id))) continue;
      for (const {id, count} of nextCounts) homeCounts.set(id, count);
      used[from] = 1; used[to] = 1;
      for (const token of [fromToken, toToken]) {
        if (token.clusterId && clusterReadySteps[token.clusterId] === 0) {
          clusterReadySteps[token.clusterId] = frames - frame;
        }
      }
      swaps.push(Object.freeze([from, to]) as Swap);
    }
    for (const [from, to] of swaps) [state[from], state[to]] = [state[to], state[from]];
    batches.push(Object.freeze(swaps));
    states.push(Object.freeze([...state]));
  }
  return Object.freeze({seed: normalizedSeed, frames, probability, smallClusterDelay, states: Object.freeze(states), batches: Object.freeze(batches), clusterReadySteps: Object.freeze(clusterReadySteps)});
}

export function getDispersionHistory(seed: number, frames: number, probability: number, smallClusterDelay = 0): DispersionHistory {
  const key = `${Math.round(seed) | 0}:${clampFrames(frames)}:${clampProbability(probability)}:${clampDelay(smallClusterDelay)}`;
  const existing = cache.get(key);
  if (existing) { cache.delete(key); cache.set(key, existing); return existing; }
  const history = createDispersionHistory(seed, frames, probability, smallClusterDelay);
  cache.set(key, history);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return history;
}

export const inverseStateAt = (history: DispersionHistory, inverseStep: number) =>
  history.states[history.frames - Math.max(0, Math.min(history.frames, Math.round(inverseStep)))];
