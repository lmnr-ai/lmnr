import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CELL_COUNT, cellCenter} from '../../micro-14/geometry';
import {START_CELLS} from '../../micro-15/starting-positions';
import {ULTIMATE_3_DEFAULTS} from '../settings';
import {BEAT, ultimate3ScoreCues} from './cues';
import {integratedLufs, SR, toDb, truePeak} from './dsp';
import {renderUltimate3Score, SCORE_STYLES} from './render';
import {bowed, Mix, reverseSwell, riser, type PianoBank, type StringBanks} from './voices';
import {chordAt, progression, type Chord} from './writing';

const cues = ultimate3ScoreCues(ULTIMATE_3_DEFAULTS);
// Ultimate 2 runs 14.518s, so everything after it shares one grid phased from the Cost start.
const onBeat = (time: number) => { const beats = (time - cues.chapter.cost.start) / BEAT; return Math.abs(beats - Math.round(beats)) < 1e-6; };
for (const [id, chapter] of Object.entries(cues.chapter)) if (id !== 'ultimate2') assert.ok(onBeat(chapter.start), `${id} starts on the 120 BPM grid`);
assert.ok(onBeat(cues.flow.reveal) && onBeat(cues.conclusion.logo), 'the Flow-1 drop and the logo sting are downbeats');
assert.equal(cues.issues.pops.length, 47, 'one pop per issue triangle');
assert.ok(cues.issues.pops.every((pop, i, all) => (i === 0 || pop.at >= all[i - 1].at) && Math.abs(pop.pan) <= .8 && pop.height >= 0 && pop.height <= 1),
  'pops are ordered and carry on-screen position');
// Triangles pop at their scattered start cells, not at their cluster (home) cells.
const starts = Object.values(START_CELLS).map(cell => cellCenter(cell));
const gridX = Array.from({length: CELL_COUNT}, (_, cell) => cellCenter(cell).x), [minX, maxX] = [Math.min(...gridX), Math.max(...gridX)];
const expectedPans = starts.map(c => (c.x - minX) / (maxX - minX) * 1.6 - .8).sort((a, b) => a - b);
assert.deepEqual(cues.issues.pops.map(pop => pop.pan).sort((a, b) => a - b).map(p => p.toFixed(3)), expectedPans.map(p => p.toFixed(3)), 'pops are panned where each triangle appears');
assert.equal(cues.issues.clusters.length, 6, 'one lock per cluster');
assert.ok(cues.issues.typing.every(window => window.at >= cues.issues.windowDown.at), 'typing only happens inside the agent window');

// Synthetic decaying partials stand in for the Salamander notes so the test needs no ffmpeg.
const piano: PianoBank = [33, 48, 60, 72, 84, 96].map(midi => {
  const data = new Float32Array(SR * 4), hz = 440 * 2 ** ((midi - 69) / 12);
  for (let n = 0; n < data.length; n++) data[n] = Math.sin(2 * Math.PI * hz * n / SR) * Math.exp(-n / SR / .8) * .5;
  return {midi, data};
});
// Sustained saws (with a two-second loop body) stand in for the VSCO strings; pizz reuses the piano decay.
const sustain = (midi: number, gain: number) => {
  const data = new Float32Array(SR * 6), hz = 440 * 2 ** ((midi - 69) / 12);
  for (let n = 0; n < data.length; n++) data[n] = ((n * hz / SR) % 1 - .5) * gain * Math.min(1, n / 2400);
  return data;
};
const layers = (pitches: number[]) => pitches.flatMap(midi => [{midi, dynamic: 'soft' as const, data: sustain(midi, .03)}, {midi, dynamic: 'loud' as const, data: sustain(midi, .08)}]);
const strings: StringBanks = {
  violin: layers([55, 64, 72, 81, 88, 96]), violins: layers([43, 50, 57, 64, 71, 74]), celli: layers([24, 31, 38, 45, 52, 59, 65]),
  pizz: piano.filter(note => note.midi >= 48).map(note => ({...note, dynamic: 'loud' as const})),
};
const hash = (audio: {l: Float32Array; r: Float32Array}) => createHash('sha256').update(audio.l).update(audio.r).digest('hex');
for (const style of Object.keys(SCORE_STYLES)) {
  const full = (seed?: number) => renderUltimate3Score(ULTIMATE_3_DEFAULTS, piano, {style, seed, strings: SCORE_STYLES[style].strings ? strings : undefined});
  const render = (seed?: number) => full(seed).master;
  const {master: first, report} = full();
  if (style.endsWith('-acoustic')) for (const voice of ['beep', 'tick', 'drain', 'bass']) assert.ok(!report.counts[voice], `${style}: no electronic ${voice}`);
  assert.equal(hash(first), hash(render()), `${style}: the score is a pure function of settings, samples and seed`);
  assert.notEqual(hash(render(7)), hash(first), `${style}: the seed only varies noise and humanisation`);
  assert.equal(first.length, Math.round(cues.duration * SR), `${style}: audio length matches the composition`);
  assert.ok(Math.abs(integratedLufs(first) + 14) < .3, `${style}: mastered to -14 LUFS`);
  assert.ok(toDb(truePeak(first)) <= -1, `${style}: true peak stays under -1 dBTP`);
}
// A retimed anchor that lands before the fixed offsets listed ahead of it overrides them.
const [I, IV, V, vi] = [60, 65, 67, 69].map((bass): Chord => ({bass, tones: [bass]}));
const retimed = progression([8, I], [10, IV], [12, V], [11, vi]);
assert.deepEqual(retimed.map(([beat]) => beat), [8, 10, 11], 'progressions stay sorted when an anchor moves earlier');
assert.equal(chordAt(retimed, 11.5)[1], vi, 'the moved anchor sounds from its own beat');
assert.equal(chordAt([[4, V], [0, I]], 2)[1], I, 'chordAt does not depend on listing order');
// Cue-gap durations can invert under a retime; helpers skip instead of throwing on a negative buffer.
const scratch = new Mix(4800, () => .5, []);
assert.doesNotThrow(() => { reverseSwell(scratch, .05, -.2, [60], {bus: 'music'}); riser(scratch, .06, .05, {bus: 'music'}, {level: 1, fromMidi: 60, toMidi: 72}); });

// A bowed note longer than its sample loops the sustain instead of falling silent.
const held = new Mix(SR * 10, () => .5, [], strings);
bowed(held, 0, 9, 72, {bus: 'music'}, {dynamics: [.8, .8], release: .1});
const rms = (from: number, to: number) => Math.sqrt(held.music.l.subarray(from * SR, to * SR).reduce((sum, value) => sum + value * value, 0) / ((to - from) * SR));
assert.ok(rms(7, 8.5) > rms(1, 2) * .7, 'long bowed notes keep sounding past the 6 s sample');
assert.throws(() => bowed(new Mix(SR, () => .5, []), 0, .5, 72, {bus: 'music'}), /Missing "violin" string samples/);
assert.throws(() => renderUltimate3Score(ULTIMATE_3_DEFAULTS, piano, {style: 'nope'}), /Unknown score style/);
console.log('score tests passed');
