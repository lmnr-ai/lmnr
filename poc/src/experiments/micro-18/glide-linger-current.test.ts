import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import current from '../../../handoff/glide-linger-current/settings.json';
import incoming from '../../../handoff/turbopuffer-sound/minimal-settings.json';
import {normalizeVoiceoverSettings} from './voiceover-cut';
import {sampleUltimate3, ultimate3DurationFrames} from './sample';
import {Ultimate3Scene} from './Scene';
import {VOICEOVER_BEDS} from './voiceover-phrases';

const settings = normalizeVoiceoverSettings(current);
const white = readFileSync(new URL('../../../public/micro-07/spinner.svg', import.meta.url), 'utf8');
const referencePath = white.match(/\bd="([^"]+)"/)![1];
const referenceStroke = Number(white.match(/stroke-width="([^"]+)"/)![1]);
const render = (time: number) => renderToStaticMarkup(createElement(Ultimate3Scene, {settings, sample: sampleUltimate3(time, settings)}));

test('current Ultimate3 renders all three yellow spinners with the white agent path and stroke', () => {
  assert.equal(settings.cost.controls.cheapSpinnerStrokeWidth, referenceStroke);
  for (const time of [20.7, 21, 21.5, 22, 21, 20.7]) {
    const html = render(time);
    const yellow = [...html.matchAll(/<g data-agent="cheap"[^>]*><circle[^>]*><\/circle><g[^>]*>(<path[^>]*><\/path>)/g)];
    assert.equal(yellow.length, 3);
    for (const [,path] of yellow) {
      assert.ok(path.includes(`d="${referencePath}"`));
      assert.ok(path.includes(`stroke-width="${referenceStroke}"`));
      assert.ok(path.includes('stroke="black"'));
      assert.ok(path.includes('transform="translate(-44.5 -44.5)"'));
    }
  }
});

test('current cut changes only yellow stroke from the approved linger picture; historical settings remain literal', () => {
  const original = normalizeVoiceoverSettings(incoming);
  assert.deepEqual(settings, {...original, cost: {...original.cost, controls: {...original.cost.controls, cheapSpinnerStrokeWidth: referenceStroke}}});
  assert.equal(original.cost.controls.cheapSpinnerStrokeWidth, 1.5);
  assert.equal(settings.paperTexture, false);
  assert.equal(ultimate3DurationFrames(settings), 2212);
  assert.equal(settings.flow.comparison && settings.flow.comparison.version, 2);
  assert.deepEqual(settings.voiceover, original.voiceover);
});

test('linger bed is registered, complete to the final frame, and matches the upstream PCM checksum', () => {
  const bed = VOICEOVER_BEDS['glide-minimal-linger'];
  assert.ok(bed);
  const url = new URL(`../../../public${bed.url}`, import.meta.url);
  assert.ok(existsSync(url));
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', url), 'utf8'));
  assert.equal(manifest.frames, ultimate3DurationFrames(settings));
  assert.equal(manifest.samples, 2212 / 30 * 48000);
  assert.equal(createHash('sha256').update(readFileSync(url)).digest('hex'), manifest.bed.sha256);
});
