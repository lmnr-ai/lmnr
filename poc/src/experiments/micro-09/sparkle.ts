import {GRID} from './geometry';

export const WARNING_ASSETS = [
  'group-153.svg', // yellow
  'group-151.svg', // purple
  'group-152.svg', // green
  'group-154.svg', // coral
  'group-155.svg', // pink
  'group-156.svg', // blue
] as const;

export const SPARKLE_DEFAULTS = {
  clockFrequency: 4,
  triangleProbability: .2,
  stateChangeProbability: .4,
  colorChangeProbability: .83,
  isolationWeight: 9.25,
} as const;

export type SparkleControls = {
  clockFrequency: number;
  triangleProbability: number;
  stateChangeProbability: number;
  colorChangeProbability: number;
  isolationWeight: number;
};

export type SparkleCell = {kind: 'dot'} | {kind: 'triangle'; asset: string};

const CELL_COUNT = GRID.columns * GRID.rows;
const clampProbability = (value: number) => Math.max(0, Math.min(1, value));

function hash(seed: number, cell: number, channel: number) {
  let value = (Math.round(seed) ^ Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function nextColor(seed: number, cell: number, channel: number, color: number) {
  const jump = 1 + Math.floor(hash(seed, cell, channel) * (WARNING_ASSETS.length - 1));
  return (color + jump) % WARNING_ASSETS.length;
}

function neighborFraction(states: readonly boolean[], cell: number) {
  const row = Math.floor(cell / GRID.columns);
  const column = cell % GRID.columns;
  let neighbors = 0;
  let triangles = 0;
  // DECISION: "Border" means four edge-sharing neighbors, not diagonals.
  for (const [rowOffset, columnOffset] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nextRow = row + rowOffset;
    const nextColumn = column + columnOffset;
    if (nextRow < 0 || nextRow >= GRID.rows || nextColumn < 0 || nextColumn >= GRID.columns) continue;
    neighbors++;
    if (states[nextRow * GRID.columns + nextColumn]) triangles++;
  }
  // Normalize by available neighbors so outer grid cells receive no automatic preference.
  return neighbors === 0 ? 0 : triangles / neighbors;
}

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export function spatialTriangleProbabilities(
  states: readonly boolean[],
  triangleProbability: number,
  isolationWeight: number,
) {
  const target = clampProbability(triangleProbability);
  if (target === 0 || target === 1) return states.map(() => target);
  if (isolationWeight <= 0) return states.map(() => target);

  const targetSum = states.length * target;
  const baseLogit = Math.log(target / (1 - target));
  const scores = states.map((_, cell) => -neighborFraction(states, cell));
  let low = -40;
  let high = 40;

  // The global offset makes sum(adjustedProbability - target) approximately zero.
  for (let iteration = 0; iteration < 48; iteration++) {
    const offset = (low + high) / 2;
    const sum = scores.reduce((total, score) => total + sigmoid(baseLogit + offset + isolationWeight * score), 0);
    if (sum < targetSum) low = offset;
    else high = offset;
  }

  const offset = (low + high) / 2;
  const probabilities = scores.map(score => sigmoid(baseLogit + offset + isolationWeight * score));
  const residual = targetSum - probabilities.reduce((sum, probability) => sum + probability, 0);
  const correctionIndex = probabilities.findIndex(probability => probability + residual >= 0 && probability + residual <= 1);
  if (correctionIndex >= 0) probabilities[correctionIndex] += residual;
  return probabilities;
}

export function sampleSparkleGrid(
  time: number,
  seed: number,
  controls: SparkleControls = SPARKLE_DEFAULTS,
): SparkleCell[] {
  const triangleProbability = clampProbability(controls.triangleProbability);
  let states = Array.from({length: CELL_COUNT}, (_, cell) => hash(seed, cell, 0) < triangleProbability);
  const colors = Array.from({length: CELL_COUNT}, (_, cell) => Math.floor(hash(seed, cell, 1) * WARNING_ASSETS.length));
  const clockFrequency = Math.max(.01, controls.clockFrequency);
  const elapsedTicks = Math.floor(Math.max(0, time) * clockFrequency);
  const stateProbability = clampProbability(controls.stateChangeProbability);
  const colorProbability = clampProbability(controls.colorChangeProbability);

  // PERFORMANCE NOTE: deterministic random access currently replays ticks from t=0.
  for (let tick = 1; tick <= elapsedTicks; tick++) {
    const spatialProbabilities = spatialTriangleProbabilities(states, triangleProbability, controls.isolationWeight);
    const nextStates = states.slice();

    // All cells read the same snapshot and commit simultaneously; iteration order cannot bias neighbors.
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const directionalProbability = states[cell]
        ? 1 - spatialProbabilities[cell]
        : spatialProbabilities[cell];
      if (hash(seed, cell, 10 + tick) < stateProbability * directionalProbability) {
        nextStates[cell] = !states[cell];
        if (nextStates[cell]) colors[cell] = Math.floor(hash(seed, cell, 100 + tick) * WARNING_ASSETS.length);
      }
      if (nextStates[cell] && hash(seed, cell, 10000 + tick) < colorProbability) {
        colors[cell] = nextColor(seed, cell, 20000 + tick, colors[cell]);
      }
    }
    states = nextStates;
  }

  return states.map((triangle, cell) => triangle
    ? {kind: 'triangle', asset: WARNING_ASSETS[colors[cell]]}
    : {kind: 'dot'});
}
