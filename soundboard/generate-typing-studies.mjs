import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 48_000;
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
// Bursts, hesitations, corrections and pauses rather than a metronomic stream.
const events = [0.12, 0.19, 0.31, 0.58, 0.65, 0.73, 1.08, 1.16, 1.22, 1.57, 1.93, 2.01, 2.12, 2.48, 2.57];

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return (((value ^ value >>> 14) >>> 0) / 4294967296) * 2 - 1;
  };
}

function renderVoice(voice, seed) {
  const length = Math.round(2.9 * SR), left = new Float32Array(length), right = new Float32Array(length), rng = random(seed);
  events.forEach((at, index) => {
    const velocity = .72 + (rng() + 1) * .14;
    const pan = (rng() * .18) + (index % 3 - 1) * .035;
    const [gl, gr] = [Math.sqrt((1 - pan) / 2), Math.sqrt((1 + pan) / 2)];
    const start = Math.round((at + rng() * .006) * SR), eventLength = Math.round(voice.length * SR);
    const phases = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
    let smoothNoise = 0;
    for (let n = 0; n < eventLength && start + n < length; n++) {
      const t = n / SR;
      smoothNoise += voice.noiseSmooth * (rng() - smoothNoise);
      const attack = Math.min(1, t / voice.attack);
      const envelope = attack * Math.exp(-t / voice.decay);
      let sample = smoothNoise * voice.noise;
      voice.tones.forEach(([hz, level, pitchDrop], toneIndex) => {
        const frequency = hz * (1 + pitchDrop * Math.exp(-t / .008));
        phases[toneIndex] += Math.PI * 2 * frequency / SR;
        sample += Math.sin(phases[toneIndex]) * level;
      });
      sample *= envelope * velocity;
      left[start + n] += sample * gl;
      right[start + n] += sample * gr;
    }
  });
  let peak = 0;
  for (const channel of [left, right]) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const gain = .16 / Math.max(peak, 1e-8);
  for (const channel of [left, right]) for (let n = 0; n < length; n++) channel[n] *= gain;
  return {left, right};
}

function writeWav(name, {left, right}) {
  const bytes = left.length * 6, output = Buffer.alloc(44 + bytes);
  output.write('RIFF', 0); output.writeUInt32LE(36 + bytes, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(2, 22); output.writeUInt32LE(SR, 24);
  output.writeUInt32LE(SR * 6, 28); output.writeUInt16LE(6, 32); output.writeUInt16LE(24, 34); output.write('data', 36); output.writeUInt32LE(bytes, 40);
  let offset = 44;
  for (let n = 0; n < left.length; n++) for (const sample of [left[n], right[n]]) {
    output.writeIntLE(Math.round(Math.max(-1, Math.min(1, sample)) * 8_388_607), offset, 3); offset += 3;
  }
  fs.writeFileSync(path.join(assets, name), output);
}

const voices = {
  'typing-soft-felt.wav': {length: .075, attack: .006, decay: .018, noise: .05, noiseSmooth: .08, tones: [[145, .62, .16], [290, .11, .08]]},
  'typing-muted-laptop.wav': {length: .045, attack: .0025, decay: .009, noise: .22, noiseSmooth: .18, tones: [[540, .16, .1], [1080, .035, .04]]},
  'typing-warm-wood.wav': {length: .09, attack: .004, decay: .024, noise: .035, noiseSmooth: .06, tones: [[205, .55, .22], [455, .16, .12]]},
  'typing-gentle-fingertips.wav': {length: .065, attack: .008, decay: .016, noise: .025, noiseSmooth: .045, tones: [[118, .7, .08], [236, .08, .05]]},
};
for (const [name, voice] of Object.entries(voices)) writeWav(name, renderVoice(voice, name.length * 997));
console.log(`Wrote ${Object.keys(voices).length} irregular typing studies to ${assets}`);
