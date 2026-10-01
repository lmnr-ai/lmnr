import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import preview from '../../../../../handoff/openai-sound-design/preview-settings.json';
import type {Ultimate3Settings} from '../../settings';
import {VOICEOVER_BED, VOICEOVER_BEDS, voiceoverBedUrl} from '../../voiceover-phrases';
import {selectedVoiceoverBed} from '../../voiceover-engine';
import {ultimate3ScoreCues} from '../cues';
import {suckOuts} from '../openai/composition';
import {renderUltimate3Score, SCORE_STYLES} from '../render';
import {TACTILE_LAYERS} from './composition';

const settings = preview as unknown as Ultimate3Settings;
const cues = ultimate3ScoreCues(settings);
const render = (layers?: Record<string, number>) => renderUltimate3Score(settings, [], {style: 'openai-tactile', seed: 107290, gain: 1, layers});
const full = render();
const rms = (channel: Float32Array, from: number, to: number) => {
  let sum = 0; const a = Math.round(from * 48_000), b = Math.round(to * 48_000);
  for (let n = a; n < b; n++) sum += channel[n] ** 2;
  return 10 * Math.log10(sum / (b - a) + 1e-20);
};

test('openai-tactile is a synthesized, named-layer score with no piano', () => {
  assert.deepEqual(SCORE_STYLES['openai-tactile'].layers, TACTILE_LAYERS);
  assert.equal(full.report.counts.piano, undefined);
  for (const voice of ['sub', 'thump', 'pluck', 'glass', 'grain', 'bloom', 'drone', 'keyClick']) assert.ok(full.report.counts[voice] > 0, voice);
  assert.equal(full.report.counts.keyClick, cues.issues.typingEvents.length, 'the bed owns the typing, once per event');
});

test('layers are separable through the speech carve: a solo layer plus the rest sums to the full mix', () => {
  const off = Object.fromEntries(TACTILE_LAYERS.map(layer => [layer, 0]));
  for (const layer of ['sub', 'grain'] as const) {
    const solo = render({...off, [layer]: 1}), rest = render({[layer]: 0});
    let error = 0;
    for (let n = 0; n < full.master.length; n++) error = Math.max(error, Math.abs(solo.master.l[n] + rest.master.l[n] - full.master.l[n]));
    assert.ok(error < 1e-5, `${layer} residual ${error}`);
  }
});

test('only the two payoffs get true silence; they land at least 10 dB over their builds', () => {
  const payoffs = [cues.flow.reveal, cues.conclusion.logo];
  for (const [drop, length] of suckOuts(cues)) {
    const inside = rms(full.master.l, drop - length + .06, drop - .01), hit = rms(full.master.l, drop, drop + .3);
    if (payoffs.includes(drop)) {
      assert.ok(hit - inside > 30, `${drop}: ${hit.toFixed(1)} vs ${inside.toFixed(1)}`);
      assert.ok(hit - rms(full.master.l, drop - length - 1.2, drop - length) > 10, `${drop} lands over its build`);
    } else assert.ok(inside > hit - 30, `${drop}: the room tails carry through (${inside.toFixed(1)} vs ${hit.toFixed(1)})`);
  }
});

test('the default bed is the frozen openai-tactile render under the unchanged editable-v11 phrases', () => {
  assert.equal(VOICEOVER_BED, 'tactile');
  assert.equal(voiceoverBedUrl(), '/audio/voiceover/editable-v11-openai-tactile/bed.wav');
  assert.equal(selectedVoiceoverBed('?bed=piano'), 'piano');
  assert.equal(selectedVoiceoverBed('?bed=nope'), 'tactile');
  const base = new URL('../../../../../public/audio/voiceover/', import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, base));
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const edition = VOICEOVER_BEDS.tactile.slice('/audio/voiceover/'.length);
  const manifest = JSON.parse(read(`${edition}manifest.json`).toString());
  const phrases = JSON.parse(read('editable-v11/manifest.json').toString());
  assert.equal(manifest.scoreStyle, 'openai-tactile');
  assert.deepEqual(Object.keys(manifest.layers), [...TACTILE_LAYERS]);
  assert.equal(manifest.samples, phrases.samples);
  assert.equal(manifest.phraseManifestSha256, sha(read('editable-v11/manifest.json')));
  const bed = read(`${edition}${manifest.bed.file}`);
  assert.equal(sha(bed), manifest.bed.sha256);
  assert.equal(bed.readUInt32LE(24), 48000);
  assert.equal(bed.readUInt16LE(34), 24);
  assert.ok(manifest.score.truePeakDb <= -.9, 'the fixed-gain score never clips');
});
