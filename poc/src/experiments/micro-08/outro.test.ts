import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {CELL, ROWS, SPEED, TILE_PERIOD, positiveModulo} from './geometry';
import {DOT_DIM_COLOR, DOT_GRID, INITIAL_OUTRO, LOADER_PATH, OTHER_DOTS, OUTRO_KEYS, dotFill, gridColumnProgress, gridDotPose, ribbonPatternX, rowPose} from './outro';
import {sampleMicro08, sampleStreamers} from './sample';
import {MICRO_08_DURATION, MICRO_08_TIMELINE} from './timeline';
import {Micro08Scene} from './Scene';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
assert.equal(DOT_GRID.rows, ROWS.length);
assert.equal(DOT_GRID.columns, 16);
assert.equal(DOT_GRID.diameter, 20);
assert.equal(DOT_GRID.spacing, 80);
assert.equal(OTHER_DOTS.length, 105);
assert.ok(OTHER_DOTS.every(dot => dot.column > 0 && dot.x > DOT_GRID.x));
assert.equal(new Set(OTHER_DOTS.map(dot => `${dot.x},${dot.y}`)).size, 105);
assert.equal(DOT_GRID.y + (DOT_GRID.rows - 1) * DOT_GRID.spacing / 2, 360);
assert.equal(DOT_GRID.x + (DOT_GRID.columns - 1) * DOT_GRID.spacing, 1240);
const spinner = readFileSync(new URL('../../../public/micro-08/spinner.svg', import.meta.url), 'utf8');
assert.equal(spinner.match(/ d="([^"]+)"/)![1], LOADER_PATH, 'inline stroke uses original spinner geometry');
assert.match(spinner, /stroke-width="2"/);

const positionEnd = MICRO_08_TIMELINE.dotPosition.at + MICRO_08_TIMELINE.dotPosition.duration;
assert.ok(MICRO_08_TIMELINE.streamerExit.at > positionEnd, 'stream exit must start AFTER position finishes');
assert.ok(MICRO_08_TIMELINE.travel.duration > MICRO_08_TIMELINE.streamerExit.at + MICRO_08_TIMELINE.streamerExit.duration, 'travel clock covers the complete fade');
for (let index = 0; index < ROWS.length; index++) {
  const start = rowPose(index, sampleMicro08(0).outro);
  assert.equal(start.x, ROWS[index].agent.x);
  assert.equal(start.y, ROWS[index].agent.y);
  assert.equal(start.radius, CELL / 2);
  assert.equal(start.scale, 1);
  assert.equal(start.loaderStrokeWidth, 2);
  const middle = rowPose(index, sampleMicro08(9).outro);
  assert.ok(middle.x < start.x && middle.x > DOT_GRID.x);
  assert.ok(middle.radius < 24 && middle.radius > 10);
  assert.ok(middle.loaderStrokeWidth > 0 && middle.loaderStrokeWidth < 2);
  const landed = rowPose(index, sampleMicro08(positionEnd).outro);
  assert.equal(landed.x, 40);
  assert.equal(landed.y, 120 + index * 80);
  assert.equal(landed.radius, 10);
  assert.equal(landed.loaderStrokeWidth, 0);
  assert.equal(landed.streamOpacity, 1);
  const a = sampleMicro08(10.1), b = sampleMicro08(10.11);
  near(positiveModulo(b.stripPhase - a.stripPhase, TILE_PERIOD), SPEED * .01);
  near(ribbonPatternX(rowPose(index, b.outro), b.stripPhase) - ribbonPatternX(rowPose(index, a.outro), a.stripPhase), -SPEED * .01 * landed.scale);
  assert.equal(rowPose(index, b.outro).streamOpacity, 1, 'still visibly streaming after landing');
  assert.ok(rowPose(index, sampleMicro08(10.65).outro).streamOpacity > 0, 'tail remains visible during exit');
  const final = rowPose(index, sampleMicro08(12).outro);
  assert.equal(final.streamOpacity, 0);
  assert.equal(final.loaderStrokeWidth, 0);
}
const final = sampleMicro08(MICRO_08_DURATION).outro;
assert.equal(final.backdropFade, 1);
for (const dot of OTHER_DOTS) {
  const start = gridDotPose(dot, 0), end = gridDotPose(dot, final.gridSlide);
  assert.ok(start.x - start.radius >= 1280, 'starts fully offscreen to the right');
  assert.equal(end.x, dot.x);
  assert.equal(end.y, dot.y);
  let previousX = start.x;
  for (const progress of [0, .1, .25, .5, .75, .9, 1]) {
    const pose = gridDotPose(dot, progress);
    assert.equal(pose.radius, 10, 'incoming dots NEVER scale');
    assert.equal(pose.opacity, 1, 'incoming dots NEVER fade in');
    assert.equal(pose.y, dot.y, 'horizontal-only slide');
    assert.ok(pose.x <= previousX);
    const sameColumn = OTHER_DOTS.find(other => other.column === dot.column)!;
    near(pose.x, gridDotPose(sameColumn, progress).x);
    previousX = pose.x;
  }
}
assert.equal(MICRO_08_TIMELINE.gridSlide.at, MICRO_08_TIMELINE.dotPosition.at, 'columns start alongside loader movement');
const moving = sampleMicro08(9).outro;
assert.ok(moving.dotPosition > 0 && moving.dotPosition < 1);
assert.ok(gridDotPose(OTHER_DOTS[0], moving.gridSlide).x < 1280, 'incoming columns are onscreen BEFORE loaders land');
assert.ok(gridColumnProgress(1, .2) > gridColumnProgress(2, .2));
assert.equal(gridColumnProgress(15, .2), 0, 'later columns have not started yet');
for (const progress of [0, .1, .2, .4, .6, .8, .99, 1]) {
  const columns = OTHER_DOTS.filter(dot => dot.row === 0).map(dot => gridDotPose(dot, progress));
  for (let index = 1; index < columns.length; index++) {
    assert.ok(columns[index].x - columns[index - 1].x >= DOT_GRID.spacing - 1e-7, 'staggered columns never overtake');
  }
}
assert.equal(dotFill(0), '#ffffff');
assert.equal(dotFill(1), DOT_DIM_COLOR);
assert.equal(dotFill(final.dotDim), '#4e4e4e');
assert.equal(dotFill(sampleMicro08(10.9).outro.dotDim), '#ffffff');
const middleColor = parseInt(dotFill(sampleMicro08(11.35).outro.dotDim).slice(1, 3), 16);
assert.ok(middleColor > 78 && middleColor < 255, 'dim is animated, not an abrupt fill swap');
assert.deepEqual(sampleMicro08(1e12).outro, final, 'outro clamps, never repeats');
assert.deepEqual(sampleMicro08(-100).outro, INITIAL_OUTRO);
const times = [0, 7.999, 8, 8.2, 9, 9.6, 10, 10.1, 10.4, 10.65, 10.9, 11.3, 12, 99];
assert.deepEqual(times.map(sampleMicro08), [...times].reverse().map(sampleMicro08).reverse());
const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_08_TIMELINE), {});
for (const time of times) for (const key of OUTRO_KEYS) {
  const current = (computeClipState(clips.find(clip => clip.key === key)!, time, time) as {current: {progress: number}}).current;
  near(sampleMicro08(time).outro[key], current.progress);
}
for (const time of [8, 9, 10, 10.5, 10.89, 11, 12]) {
  const a = sampleStreamers(time), b = sampleStreamers(time + 1 / 30);
  near(positiveModulo(b.stripPhase - a.stripPhase, TILE_PERIOD), SPEED / 30);
}
const render = (time: number) => renderToStaticMarkup(createElement(Micro08Scene, {...sampleMicro08(time), background: 'reference'}));
for (const time of times) {
  const html = render(time);
  assert.equal((html.match(/class="micro08-head"/g) ?? []).length, 7, 'same seven heads, no replacement first column');
  assert.equal((html.match(/class="micro08-grid-dot"/g) ?? []).length, 105);
  assert.equal((html.match(/class="micro08-strip"/g) ?? []).length, 7);
  assert.equal((html.match(/class="micro08-loader"/g) ?? []).length, 7);
}
assert.equal((render(12).match(/stroke-width="0"/g) ?? []).length, 7, 'actual SVG stroke width reaches zero');
assert.notEqual(render(0), render(12), 'composition ends on the grid, not the original loop');
assert.equal((render(12).match(/fill="#4e4e4e"/g) ?? []).length, 112, 'all dots, including original heads, use the Figma fill');
console.log('Micro08 outro: 7 original heads→first column; 105 constant-size dots ease in by staggered column during loader movement; all112 dim to #4e4e4e; exact20px/80px geometry; stroke2→0; streaming through exit; finite/random/reverse seek and DialKit parity passed.');
