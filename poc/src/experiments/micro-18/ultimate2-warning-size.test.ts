import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SCATTERED_WARNING, MacroGrid} from '../micro-17/Grid';
import {worldState} from '../micro-17/geometry';
import {sampleUltimate3} from './sample';
import {normalizeSettings} from './settings';
import {VOICEOVER_DEFAULTS} from './voiceover-cut';

const source = readFileSync(new URL('../micro-17/World.tsx', import.meta.url), 'utf8');
const redImage = source.match(/<image href=\{staticFile\('micro-12\/warning\.svg'\)\} x=\{(-?[\d.]+)\} y=\{(-?[\d.]+)\} width=\{([\d.]+)\} height=\{([\d.]+)\}/);
assert.ok(redImage, 'the red marker must still render its original SVG at the sampled warning transform');
const [, redX, redY, redWidth, redHeight] = redImage.map(Number);
assert.equal(redX, -redWidth / 2);
assert.equal(redY, -redHeight / 2);
assert.match(source, /transform=\{`translate\(\$\{s\.warning\.x\} \$\{s\.warning\.y\}\) scale\(\$\{s\.warning\.scale\}\)`\}/);
for (const [asset, width, height] of [['micro-12/warning.svg', redWidth, redHeight],
  [SCATTERED_WARNING.asset, SCATTERED_WARNING.width, SCATTERED_WARNING.height]] as const) {
  const svg = readFileSync(new URL(`../../../public/${asset}`, import.meta.url), 'utf8');
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(viewBox, `${asset} should paint to its full positive-origin viewBox`);
  assert.ok(Math.abs(Number(viewBox[1]) - width) < .001);
  assert.ok(Math.abs(Number(viewBox[2]) - height) < .001);
  assert.match(svg, /<path d="M/);
}

const projected = (time: number, settings = VOICEOVER_DEFAULTS) => {
  const playback = sampleUltimate3(time, settings).ultimate2;
  assert.ok(playback, `Ultimate 2 should be active at ${time}`);
  const state = worldState(playback, settings.ultimate2.controls);
  const grid = renderToStaticMarkup(createElement(MacroGrid, {contentScale: state.contentScale}));
  const gray = grid.match(/data-scattered-warning="18"[^>]* width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(gray, 'measure a warning actually emitted by MacroGrid, not an unused asset size');
  return {state, redWidth: redWidth * state.warning.scale * state.scale,
    redHeight: redHeight * state.warning.scale * state.scale,
    grayWidth: Number(gray[1]) * state.scale, grayHeight: Number(gray[2]) * state.scale};
};

const near = (actual: number, expected: number, tolerance = .001) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('the imported Ultimate 3 warning matches the scattered SVG painted size after its animated endpoint and camera zoom', () => {
  const zoom = VOICEOVER_DEFAULTS.ultimate2.timing.finalZoom;
  const before = projected(zoom.at);
  near(before.state.scale, 1);
  near(before.state.warning.scale, 1);
  near(before.redWidth, redWidth);
  const halfway = projected(zoom.at + zoom.duration / 2);
  assert.ok(halfway.redWidth < before.redWidth && halfway.redWidth > SCATTERED_WARNING.width);
  const final = projected(zoom.at + zoom.duration);
  near(final.redWidth, final.grayWidth);
  near(final.redHeight, final.grayHeight);
  near(final.grayWidth, SCATTERED_WARNING.width);
  near(final.grayHeight, SCATTERED_WARNING.height);
  for (const time of [zoom.at + zoom.duration, zoom.at + zoom.duration / 2, zoom.at]) {
    assert.deepEqual(projected(time), time === zoom.at ? before : time === zoom.at + zoom.duration ? final : halfway,
      'reverse seek must return the same geometry');
  }
});

test('retimed and instantaneous finalZoom retain the same settled marker geometry', () => {
  const original = VOICEOVER_DEFAULTS.ultimate2.timing;
  for (const duration of [2, 0]) {
    const settings = normalizeSettings({...VOICEOVER_DEFAULTS, ultimate2: {...VOICEOVER_DEFAULTS.ultimate2,
      timing: {...original, finalZoom: {...original.finalZoom, at: original.finalZoom.at, duration}}}});
    const result = projected(original.finalZoom.at + duration, settings);
    near(result.redWidth, result.grayWidth);
    near(result.redHeight, result.grayHeight);
  }
});
