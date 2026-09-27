import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MacroGrid, SCATTERED_WARNING, SPOTTY_CELLS} from './Grid';
import {CELLS, worldState} from './geometry';
import {sampleMicro17} from './sample';

const markup = (time: number) => {
  const state = worldState(sampleMicro17(time));
  return state.bigGridVisible ? renderToStaticMarkup(createElement(MacroGrid, {contentScale: state.contentScale})) : '';
};
test('reference placements are stable, sparse and never decorate the hero or mutate shared cells', () => {
  assert.equal(SPOTTY_CELLS.length, 135);
  assert.deepEqual(SPOTTY_CELLS.filter(c => c.warning).map(c => c.id), [18, 28, 38, 39, 47, 49, 52, 55, 57, 72, 79, 81, 85, 92, 99, 102, 111]);
  assert.equal(SPOTTY_CELLS.filter(c => c.fill === '#1f1f1f').length, 24);
  assert.equal(SPOTTY_CELLS.filter(c => c.fill === '#242424').length, 8);
  assert.equal(SPOTTY_CELLS[67].hero, true);
  assert.equal(SPOTTY_CELLS[67].warning, false);
  assert.equal(SPOTTY_CELLS[67].fill, undefined);
  for (let i = 0; i < CELLS.length; i++) {
    const {fill: _fill, warning: _warning, ...cell} = SPOTTY_CELLS[i];
    assert.deepEqual(cell, CELLS[i]);
    assert.ok(!('fill' in CELLS[i]) && !('warning' in CELLS[i]));
  }
});
test('SVG paints fills below all borders, replaces dots with warnings, and keeps final reference sizes', () => {
  const rendered = markup(12.4);
  assert.equal((rendered.match(/data-cell-fill=/g) ?? []).length, 32);
  assert.equal((rendered.match(/data-grid-cell=/g) ?? []).length, 135);
  assert.equal((rendered.match(/data-scattered-warning=/g) ?? []).length, 17);
  assert.equal((rendered.match(/<circle /g) ?? []).length, 117);
  assert.ok(rendered.lastIndexOf('data-cell-fill=') < rendered.indexOf('data-grid-cell='));
  assert.equal((rendered.match(/vector-effect="non-scaling-stroke"/g) ?? []).length, 135);
  const state = worldState(sampleMicro17(12.4));
  const projected = state.scale * state.contentScale;
  assert.ok(Math.abs(projected * 120 - 12) < 1e-9);
  assert.ok(Math.abs(projected * SCATTERED_WARNING.width * 10 - 37.6942138671875) < 1e-9);
  assert.ok(Math.abs(projected * SCATTERED_WARNING.height * 10 - 35.004878997802734) < 1e-9);
  const asset = readFileSync(new URL('../../../public/micro-17/scattered-warning.svg', import.meta.url), 'utf8');
  assert.match(asset, /fill="#3D3D3D"/);
  assert.match(asset, /fill="#1A1A1A"/);
  assert.doesNotMatch(asset, /#F78079|https?:\/\/(?!www.w3.org)/);
});
test('no early decoration, no random re-roll on reverse seeks, stable cloud hold and far-future sampling', () => {
  assert.equal(markup(0), ''); assert.equal(markup(10), '');
  const times = [12.4, 10.8, 11.5, 12, 15, 1e6];
  const expected = times.map(markup);
  for (let i = times.length - 1; i >= 0; i--) assert.equal(markup(times[i]), expected[i]);
  assert.equal(markup(12.4), markup(1e6));
});
