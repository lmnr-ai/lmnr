import assert from 'node:assert/strict';
import {CLOUDS, GRID, TRIANGLES, interpolateCloudRects, interpolateRect} from './geometry';
import {sampleMicro09} from './sample';
import {MICRO_09_DURATION} from './timeline';
import {sampleSparkleGrid, spatialTriangleProbabilities, SPARKLE_DEFAULTS, WARNING_ASSETS, type SparkleControls} from './sparkle';

assert.deepEqual(GRID, {x: -110, y: -90, columns: 15, rows: 9, cell: 100});
assert.equal(TRIANGLES.size, 15);
assert.deepEqual(interpolateRect(CLOUDS.start[0], CLOUDS.end[0], 0), CLOUDS.start[0]);
assert.deepEqual(interpolateRect(CLOUDS.start[1], CLOUDS.end[1], 1), CLOUDS.end[1]);
assert.deepEqual(interpolateCloudRects(0, 120), CLOUDS.start, 'final Y offset must not move the starting clouds');
assert.equal(interpolateCloudRects(1, 120)[0].y, CLOUDS.end[0].y + 120, 'final Y offset must add to the first cloud destination');
assert.equal(interpolateCloudRects(1, 120)[1].y, CLOUDS.end[1].y + 120, 'final Y offset must add to the second cloud destination');
assert.equal(interpolateCloudRects(.5, 120)[0].y, interpolateRect(CLOUDS.start[0], CLOUDS.end[0], .5).y + 60, 'final Y offset must blend in with cloud progress');
assert.equal(sampleMicro09(-10).progress, 0);
assert.equal(sampleMicro09(0).progress, 0);
assert.equal(sampleMicro09(MICRO_09_DURATION).progress, 1);
assert.equal(sampleMicro09(MICRO_09_DURATION + 10).progress, 1);
assert.ok(sampleMicro09(MICRO_09_DURATION / 2).progress > .49 && sampleMicro09(MICRO_09_DURATION / 2).progress < .51);
assert.equal(sampleMicro09(-10).time, 0);
assert.equal(sampleMicro09(MICRO_09_DURATION + 10).time, MICRO_09_DURATION);

const cellsAt = (time: number, seed = 209, controls: SparkleControls = SPARKLE_DEFAULTS) =>
  sampleSparkleGrid(time, seed, controls);
const transitionCount = (from: number, to: number, controls: SparkleControls = SPARKLE_DEFAULTS) => {
  let transitions = 0;
  let previous = cellsAt(from, 209, controls);
  for (let frame = Math.floor(from * 60) + 1; frame <= Math.floor(to * 60); frame++) {
    const current = cellsAt(frame / 60, 209, controls);
    current.forEach((cell, index) => { if (cell.kind !== previous[index].kind) transitions++; });
    previous = current;
  }
  return transitions;
};

assert.equal(cellsAt(0, 209, {...SPARKLE_DEFAULTS, triangleProbability: 0}).filter(cell => cell.kind === 'triangle').length, 0);
assert.equal(cellsAt(0, 209, {...SPARKLE_DEFAULTS, triangleProbability: 1}).filter(cell => cell.kind === 'triangle').length, 135);
const averageDensity = (probability: number) => {
  let triangles = 0;
  const seeds = 100;
  for (let seed = 0; seed < seeds; seed++) {
    triangles += cellsAt(MICRO_09_DURATION, seed, {...SPARKLE_DEFAULTS, triangleProbability: probability}).filter(cell => cell.kind === 'triangle').length;
  }
  return triangles / (seeds * 135);
};
assert.ok(Math.abs(averageDensity(.1) - .1) < .02, '10% triangle probability must yield approximately 10% triangle density');
assert.ok(Math.abs(averageDensity(.4) - .4) < .03, '40% triangle probability must yield approximately 40% triangle density');

const neighborhoodFixture = Array.from({length: 135}, () => false);
const crowdedCell = 4 * 15 + 7;
for (const neighbor of [crowdedCell - 15, crowdedCell + 15, crowdedCell - 1, crowdedCell + 1]) neighborhoodFixture[neighbor] = true;
const isolatedCell = 1 * 15 + 1;
const spatialProbabilities = spatialTriangleProbabilities(neighborhoodFixture, .2, 6);
const spatialEffect = spatialProbabilities.reduce((sum, probability) => sum + probability - .2, 0);
assert.ok(Math.abs(spatialEffect) < 1e-10, `spatial probability effect must sum to zero, got ${spatialEffect}`);
assert.ok(spatialProbabilities[isolatedCell] > spatialProbabilities[crowdedCell], 'isolated cells must be preferred over cells bordering triangles');
assert.ok(spatialTriangleProbabilities(neighborhoodFixture, .2, 0).every(probability => probability === .2), 'zero isolation weight must restore uniform probabilities');
const adjacentPairs = (cells: ReturnType<typeof cellsAt>) => cells.reduce((pairs, cell, index) => {
  if (cell.kind !== 'triangle') return pairs;
  const row = Math.floor(index / 15);
  const column = index % 15;
  return pairs
    + (column < 14 && cells[index + 1].kind === 'triangle' ? 1 : 0)
    + (row < 8 && cells[index + 15].kind === 'triangle' ? 1 : 0);
}, 0);
const pairTotal = (isolationWeight: number) => Array.from({length: 30}, (_, seed) =>
  adjacentPairs(cellsAt(6, seed, {...SPARKLE_DEFAULTS, triangleProbability: .2, stateChangeProbability: .2, isolationWeight})))
  .reduce((sum, pairs) => sum + pairs, 0);
assert.ok(pairTotal(6) < pairTotal(0) * .6, 'isolation weight must substantially reduce adjacent triangle pairs');

const firstTwoSeconds = transitionCount(0, 2);
const lastTwoSeconds = transitionCount(4, 6);
assert.ok(firstTwoSeconds > 0 && lastTwoSeconds > 0, 'constant state-change clock must remain active throughout');
assert.ok(lastTwoSeconds / firstTwoSeconds > .65 && lastTwoSeconds / firstTwoSeconds < 1.35, `state-change frequency must remain approximately constant: early=${firstTwoSeconds}, late=${lastTwoSeconds}`);
const slowClock = transitionCount(0, 2, {...SPARKLE_DEFAULTS, clockFrequency: 2});
const fastClock = transitionCount(0, 2, {...SPARKLE_DEFAULTS, clockFrequency: 20});
assert.ok(fastClock > slowClock * 3, `clockFrequency must control transition frequency: slow=${slowClock}, fast=${fastClock}`);

const colorOnly = {...SPARKLE_DEFAULTS, stateChangeProbability: 0, colorChangeProbability: 1};
const colorStart = cellsAt(0, 209, colorOnly);
const colorTick = cellsAt(1 / colorOnly.clockFrequency, 209, colorOnly);
assert.deepEqual(colorStart.map(cell => cell.kind), cellsAt(6, 209, colorOnly).map(cell => cell.kind), 'color probability must not affect dot/triangle state');
assert.ok(colorStart.some((cell, index) => cell.kind === 'triangle' && colorTick[index].kind === 'triangle' && cell.asset !== colorTick[index].asset), 'constant color probability must visibly recolor triangles');
assert.ok(cellsAt(6).filter(cell => cell.kind === 'triangle').every(cell => cell.kind === 'triangle' && WARNING_ASSETS.includes(cell.asset as typeof WARNING_ASSETS[number])));
assert.deepEqual(cellsAt(2.25, 209), cellsAt(2.25, 209), 'seeded sampling must be deterministic');
assert.notDeepEqual(cellsAt(2.25, 209), cellsAt(2.25, 210), 'seed input must affect sparkle');
const translated = interpolateCloudRects(.25, 27, 720, [-300, 300]);
const untranslated = interpolateCloudRects(.25, 27);
for (const index of [0, 1] as const) {
  assert.equal(translated[index].x, untranslated[index].x + (index === 0 ? -300 : 300),
    'clouds enter independently from the left and right');
  assert.equal(translated[index].width, untranslated[index].width);
  assert.equal(translated[index].height, untranslated[index].height);
  assert.equal(translated[index].y, untranslated[index].y + 720,
    'cloud entrance translates geometry inside the fixed canvas');
}

console.log(`Micro09: constant seeded sparkle clock passed (early=${firstTwoSeconds}, late=${lastTwoSeconds}, slow=${slowClock}, fast=${fastClock}).`);
