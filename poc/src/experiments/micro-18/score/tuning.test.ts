import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderEffectPreview} from './preview';
import {SR} from './dsp';
import {DEFAULT_EFFECT_TUNING, normalizeEffectTuning} from './tuning';
import type {PianoBank} from './voices';

const tuning = normalizeEffectTuning({whoosh: {volume: 99, duration: -1}, pianoCue: {transpose: 7}});
assert.equal(tuning.whoosh.volume, 2, 'values clamp to the control range');
assert.equal(tuning.whoosh.duration, .35, 'invalid low values clamp');
assert.equal(tuning.pianoCue.transpose, 7, 'valid edits survive normalization');
assert.equal(tuning.mix.music, 1, 'missing values inherit defaults');

const piano: PianoBank = [48, 60, 72, 84, 96].map(midi => {
  const data = new Float32Array(SR * 3), hz = 440 * 2 ** ((midi - 69) / 12);
  for (let n = 0; n < data.length; n++) data[n] = Math.sin(2 * Math.PI * hz * n / SR) * Math.exp(-n / SR) * .3;
  return {midi, data};
});
const hash = (audio: {l: Float32Array; r: Float32Array}) => createHash('sha256').update(audio.l).update(audio.r).digest('hex');
const defaultPreview = renderEffectPreview('whoosh', piano, DEFAULT_EFFECT_TUNING);
const darker = normalizeEffectTuning({...DEFAULT_EFFECT_TUNING, whoosh: {...DEFAULT_EFFECT_TUNING.whoosh, frequency: .5}});
assert.notEqual(hash(renderEffectPreview('whoosh', piano, darker)), hash(defaultPreview), 'whoosh controls alter the exact offline voice');
const silent = normalizeEffectTuning({...DEFAULT_EFFECT_TUNING, puff: {...DEFAULT_EFFECT_TUNING.puff, volume: 0}});
const puff = renderEffectPreview('puff', piano, silent);
let peak = 0;
for (const channel of [puff.l, puff.r]) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
assert.ok(peak < 1e-8, 'zero volume makes an isolated effect silent');
console.log('tuning tests passed');
