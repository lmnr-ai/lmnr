import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ArabesqueBedEngine, ARABESQUE_BED_CALIBRATION, ARABESQUE_THOCK_TRIM, ARABESQUE_SOUNDTRACK_URL, mixArabesquePlayback} from './arabesque-playback';
import {ULTIMATE_3_DEFAULTS} from './settings';
import {ultimate3TypingTickEvents} from './typing-audio';
import {renderThockKeystroke} from './thock-typing';

const peak = (values: Float32Array) => values.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
test('split playback has linear master and typing gain, fixed source calibration, shared PCM, no normalization', () => {
  const first = ultimate3TypingTickEvents(ULTIMATE_3_DEFAULTS)[0];
  const length = Math.ceil((first.time + .1) * 48000);
  const bed = {l: new Float32Array(length).fill(.1), r: new Float32Array(length).fill(-.1)};
  const one = mixArabesquePlayback(bed, ULTIMATE_3_DEFAULTS, 1, 1);
  const two = mixArabesquePlayback(bed, ULTIMATE_3_DEFAULTS, 2, 1);
  const zero = mixArabesquePlayback(bed, ULTIMATE_3_DEFAULTS, 0, 1);
  const noTyping = mixArabesquePlayback(bed, ULTIMATE_3_DEFAULTS, 1, 0);
  for (const key of ['l', 'r'] as const) {
    assert.equal(peak(zero[key]), 0);
    assert.ok(two[key].every((x, i) => x === 2 * one[key][i]));
  }
  assert.ok(Math.abs(noTyping.l[0] * 6.98 - bed.l[0]) < 1e-8, 'saved production master restores bed level');
  assert.equal(ARABESQUE_BED_CALIBRATION, 1 / 6.98);
  const start = Math.round(first.time * 48000), pcm = renderThockKeystroke(first.voice!);
  for (let n = 0; n < 4800; n++) assert.ok(Math.abs(one.l[start + n] - noTyping.l[start + n] - pcm.left[n] * ARABESQUE_THOCK_TRIM) < 2e-9);
});

test('active bed has exactly one source calibration and one unrestricted linear master; pause cancels pending play', async () => {
  class Node {
    gain = {value: 1}; connections: Node[] = [];
    connect(node: Node) { this.connections.push(node); return node; }
  }
  class Context {
    static latest: Context; destination = new Node(); source = new Node(); gains: Node[] = []; closed = false;
    constructor() { Context.latest = this; }
    createGain() { const node = new Node(); this.gains.push(node); return node; }
    createMediaElementSource() { return this.source; }
    async resume() {} async close() { this.closed = true; }
  }
  class Audio {
    static latest: Audio; duration = 64; currentTime = 0; paused = true; preload = ''; finish?: () => void;
    constructor(readonly src: string) { Audio.latest = this; }
    addEventListener() {} load() {} removeAttribute() {}
    play() { this.paused = false; return new Promise<void>(resolve => { this.finish = resolve; }); }
    pause() { this.paused = true; }
  }
  const oldContext = globalThis.AudioContext, oldAudio = globalThis.Audio;
  Object.assign(globalThis, {AudioContext: Context, Audio});
  try {
    const engine = new ArabesqueBedEngine(); engine.setMasterVolume(6.98); engine.update(56, true); await engine.enable();
    const ctx = Context.latest, audio = Audio.latest;
    assert.equal(audio.src, ARABESQUE_SOUNDTRACK_URL); assert.equal(audio.currentTime, 56);
    assert.deepEqual(ctx.gains.map(g => g.gain.value), [1 / 6.98, 6.98]);
    assert.deepEqual(ctx.source.connections, [ctx.gains[0]]);
    assert.deepEqual(ctx.gains[0].connections, [ctx.gains[1]]); assert.deepEqual(ctx.gains[1].connections, [ctx.destination]);
    for (const master of [0, 1, 2, 10]) { engine.setMasterVolume(master); assert.equal(ctx.gains[1].gain.value, master); }
    engine.pause(); audio.finish?.(); await Promise.resolve(); assert.equal(audio.paused, true);
    engine.update(58, false); assert.equal(audio.currentTime, 58); assert.equal(audio.paused, true);
    engine.dispose(); assert.equal(ctx.closed, true);
    const preview = new ArabesqueBedEngine('/audio/voiceover/ultimate3-voiceover-v1.wav');
    preview.update(34, false); await preview.enable();
    assert.equal(Audio.latest.src, '/audio/voiceover/ultimate3-voiceover-v1.wav');
    assert.equal(Audio.latest.currentTime, 34); assert.equal(Audio.latest.paused, true);
    preview.setMasterVolume(0); assert.equal(Context.latest.gains[1].gain.value, 0);
    preview.dispose();
  } finally { Object.assign(globalThis, {AudioContext: oldContext, Audio: oldAudio}); }
});

test('published active asset matches provenance, contains zero baked keyboard and preserves the original WAV', () => {
  const root = new URL('../../../', import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root));
  const hash = (path: string) => createHash('sha256').update(read(path)).digest('hex');
  const manifest = JSON.parse(read('public/audio/arabesque-acoustic/ultimate3-softness-8-no-typing-v1.json').toString());
  assert.equal(manifest.typingInBed, false); assert.equal(manifest.bed.counts.keyClick, undefined);
  assert.deepEqual(manifest.typingEvents, ultimate3TypingTickEvents(ULTIMATE_3_DEFAULTS));
  assert.equal(manifest.tuning.whoosh.softness, 1); assert.equal(manifest.tuning.whoosh.volume, 1.5);
  assert.equal(manifest.bed.sha256, hash('public'+ARABESQUE_SOUNDTRACK_URL));
  assert.equal(manifest.playback.sha256, hash('public/audio/arabesque-acoustic/'+manifest.playback.file));
  assert.equal(manifest.bed.duration, 1897 / 30);
  assert.ok(manifest.playback.truePeakDb < -1); assert.ok(Math.abs(manifest.playback.lufs + 14) < .1);
  assert.equal(hash('public/audio/arabesque-acoustic/ultimate3-softness-8.wav'), 'd8707a7461f96062d5a9905fb60cb04cc25f26d79db6267f12dafbb1d3a7f9a0');
});
