import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PAPER_TEXTURE_STYLE, PaperTexture} from './PaperTexture';
import {Ultimate3Scene} from './Scene';
import {chapterSchedule, sampleUltimate3, ultimate3DurationFrames} from './sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {normalizeVoiceoverSettings, readVoiceoverSettings, VOICEOVER_DEFAULTS} from './voiceover-cut';

const render = (time: number, settings = VOICEOVER_DEFAULTS) => renderToStaticMarkup(createElement(Ultimate3Scene, {settings, sample: sampleUltimate3(time, settings)}));

test('exact Figma paper asset, rotation, crop, multiply and opacity', () => {
  const asset = readFileSync(new URL('../../../public/micro-18/paper-texture.png', import.meta.url));
  assert.equal(createHash('sha256').update(asset).digest('hex'), '09423b2aa2737ab9af94f331a5dbe5535e02b91bf1db12143e4d8949160b4683');
  assert.equal(asset.readUInt32BE(16), 691);
  assert.equal(asset.readUInt32BE(20), 1024);
  assert.equal(PAPER_TEXTURE_STYLE.mixBlendMode, 'multiply');
  assert.equal(PAPER_TEXTURE_STYLE.opacity, 1);
  assert.equal(PAPER_TEXTURE_STYLE.transform, 'rotate(90deg)');
  assert.equal(PAPER_TEXTURE_STYLE.transformOrigin, '0 0');
  assert.equal(PAPER_TEXTURE_STYLE.objectFit, 'cover');
  assert.equal(PAPER_TEXTURE_STYLE.filter, undefined);
  assert.equal(PAPER_TEXTURE_STYLE.pointerEvents, 'none');
  // Rotation about (1300,-32): x=[1300-1320,1300], y=[-32,-32+891].
  assert.deepEqual([PAPER_TEXTURE_STYLE.left, PAPER_TEXTURE_STYLE.top, PAPER_TEXTURE_STYLE.width, PAPER_TEXTURE_STYLE.height], [1300, -32, 891, 1320]);
  const html = renderToStaticMarkup(createElement(PaperTexture));
  assert.match(html, /src="[^"]*micro-18\/paper-texture.png"/);
  assert.match(html, /aria-hidden="true"/);
});

test('master setting survives JSON, normalization and storage loading without changing timing/audio', () => {
  for (const enabled of [true, false]) {
    const settings = {...VOICEOVER_DEFAULTS, paperTexture: enabled};
    assert.deepEqual(normalizeVoiceoverSettings(JSON.parse(JSON.stringify(settings))), settings);
    assert.deepEqual(readVoiceoverSettings({getItem: () => JSON.stringify(settings)}), settings);
    assert.equal(ultimate3DurationFrames(settings), ultimate3DurationFrames(VOICEOVER_DEFAULTS));
    for (const time of [0, 24, 40, 52, 71]) assert.deepEqual(sampleUltimate3(time, settings), sampleUltimate3(time, VOICEOVER_DEFAULTS));
  }
  for (const value of [undefined, 'false', 1, null]) {
    assert.equal(normalizeSettings({...VOICEOVER_DEFAULTS, paperTexture: value}).paperTexture, undefined);
  }
  assert.equal(normalizeSettings(ULTIMATE_3_DEFAULTS).paperTexture, undefined);
  assert.ok(!render(0, ULTIMATE_3_DEFAULTS).includes('data-paper-texture'));
});

test('one stationary final overlay covers all chapters, transitions and captions; off is unchanged', () => {
  const on = {...VOICEOVER_DEFAULTS, paperTexture: true};
  const starts = chapterSchedule(on).map(chapter => chapter.start);
  const times = [...starts.flatMap(t => [Math.max(0, t - 1 / 30), t, t + .5]), ultimate3DurationFrames(on) / 30 - 1 / 30];
  let expectedTag: string | undefined;
  for (const time of [...times, ...[...times].reverse()]) {
    const html = render(time, on);
    const tags = html.match(/<img[^>]*data-paper-texture="true"[^>]*>/g) ?? [];
    assert.equal(tags.length, 1, `one overlay at ${time}`);
    expectedTag ??= tags[0];
    assert.equal(tags[0], expectedTag, 'overlay does not move with time or camera');
    assert.ok(html.endsWith(`${tags[0]}</div>`), 'overlay is the final viewport child');
    assert.ok(!render(time).includes('data-paper-texture'));
    assert.equal(render(time, {...on, paperTexture: false}), render(time));
  }
});
