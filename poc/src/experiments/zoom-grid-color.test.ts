import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {zoomGridColor} from './zoom-grid-color';
import {createMicro23Sampler} from './micro-23/sample';
import {MICRO_23_DEFAULTS} from './micro-23/timeline';
import {FLOW_3_APPEARANCE, FLOW_3_DENSE_GRID_COLOR, IntroducingFlow3Scene} from './micro-24/Scene';
import {sampleFlow3} from './micro-24/sample';

const grid23 = (time: number, gridColor = MICRO_23_DEFAULTS.gridColor) => {
  const {progress} = createMicro23Sampler().sample(time);
  return zoomGridColor(gridColor, progress.gridShrink * (1 - progress.returnToGrid));
};

test('dense-grid fade is deterministic, clamped and keeps the original opening color', () => {
  assert.equal(zoomGridColor('#292929', 0), '#333333');
  assert.equal(zoomGridColor('#292929', .5), '#2e2e2e');
  assert.equal(zoomGridColor('#292929', 1), '#292929');
  assert.equal(zoomGridColor('#292929', 2), '#292929');
  assert.equal(zoomGridColor('#292929', -1), '#333333');
  assert.equal(zoomGridColor('#292929', NaN), '#333333');
});

test('Animation 23 uses the existing color dial for dense grids and restores its opening color', () => {
  assert.equal(MICRO_23_DEFAULTS.gridColor, '#1f1f1f');
  assert.deepEqual([0, 3, 4.1, 3, 0].map(time => grid23(time)), ['#333333', '#1f1f1f', '#333333', '#1f1f1f', '#333333']);
  assert.equal(grid23(3, '#445566'), '#445566');
  assert.equal(grid23(0, '#445566'), '#333333');
  assert.equal(grid23(4.1, '#445566'), '#333333');
});

test('Animation 24 reserves the dense grid for the embedded Animation 23 scene only', () => {
  assert.equal(FLOW_3_DENSE_GRID_COLOR, '#1f1f1f');
  assert.equal('gridColor' in FLOW_3_APPEARANCE, false);
  for (const [time, color] of [[0, '#333333'], [5.2, '#333333'], [6.5, '#1f1f1f'], [10.1, '#333333'], [0, '#333333']] as const) {
    const html = renderToStaticMarkup(createElement(IntroducingFlow3Scene, {playback: sampleFlow3(time)}));
    assert.ok(html.includes(`background-image:linear-gradient(#333 `));
    assert.equal(html.includes(`stroke=\"${color}\"`), color === '#1f1f1f');
  }
});
