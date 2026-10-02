import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 48_000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return (((value ^ value >>> 14) >>> 0) / 4294967296) * 2 - 1;
  };
}
const smooth = value => value * value * (3 - 2 * value);
const lerp = (a, b, t) => a + (b - a) * t;

function makeAir({seconds, seed, from, to, warmth, tone = 0, direction = 0, shape = 'bloom'}) {
  const length = Math.round(seconds * SR), left = new Float32Array(length), right = new Float32Array(length);
  const random = rng(seed), randomSide = rng(seed ^ 0x9e3779b9);
  let low1 = 0, low2 = 0, low3 = 0, side1 = 0, side2 = 0, phase = 0;
  for (let n = 0; n < length; n++) {
    const t = n / (length - 1), travel = smooth(t);
    const cutoff = Math.max(90, lerp(from, to, travel));
    const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
    low1 += alpha * (random() - low1);
    low2 += alpha * (low1 - low2);
    low3 += alpha * (low2 - low3);
    const sideAlpha = 1 - Math.exp(-2 * Math.PI * cutoff * .7 / SR);
    side1 += sideAlpha * (randomSide() - side1);
    side2 += sideAlpha * (side1 - side2);

    const attack = smooth(Math.min(1, t / (shape === 'exhale' ? .12 : .28)));
    const release = smooth(Math.min(1, (1 - t) / (shape === 'lift' ? .32 : .38)));
    const envelope = attack * release * (shape === 'bloom' ? .72 + .28 * Math.sin(Math.PI * t) : 1);
    const pan = direction * (t * 2 - 1), panL = Math.sqrt((1 - pan) / 2), panR = Math.sqrt((1 + pan) / 2);
    const texture = (low2 * (1 - warmth) + low3 * warmth) * 4.2;
    const width = side2 * .65;
    phase += 2 * Math.PI * lerp(tone, tone * 1.35, travel) / SR;
    const cushion = tone ? Math.sin(phase) * .035 * Math.sin(Math.PI * t) : 0;
    left[n] = (texture + width + cushion) * envelope * panL;
    right[n] = (texture - width + cushion) * envelope * panR;
  }
  let peak = 0;
  for (const channel of [left, right]) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const gain = .17 / Math.max(peak, 1e-8);
  for (const channel of [left, right]) for (let n = 0; n < length; n++) channel[n] = Math.tanh(channel[n] * gain * 1.08) / 1.08;
  return {left, right};
}

function makeExtreme({seconds, seed, from, to, noise = .3, tones = [], direction = 0, peakAt = .5}) {
  const length = Math.round(seconds * SR), left = new Float32Array(length), right = new Float32Array(length);
  const random = rng(seed), randomSide = rng(seed ^ 0x85ebca6b);
  let a = 0, b = 0, c = 0, d = 0, sideA = 0, sideB = 0, sideC = 0;
  const phases = tones.map(() => 0);
  for (let n = 0; n < length; n++) {
    const t = n / (length - 1), travel = smooth(t), cutoff = lerp(from, to, travel);
    const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
    a += alpha * (random() - a); b += alpha * (a - b); c += alpha * (b - c); d += alpha * (c - d);
    sideA += alpha * (randomSide() - sideA); sideB += alpha * (sideA - sideB); sideC += alpha * (sideB - sideC);
    const attackLength = Math.max(.08, peakAt), releaseLength = Math.max(.08, 1 - peakAt);
    const rise = smooth(Math.min(1, t / attackLength)), fall = smooth(Math.min(1, (1 - t) / releaseLength));
    const envelope = rise * fall;
    let tonal = 0;
    tones.forEach((entry, index) => {
      const [hz, level, drift = 1.08] = entry;
      phases[index] += 2 * Math.PI * lerp(hz, hz * drift, travel) / SR;
      tonal += Math.sin(phases[index]) * level;
    });
    const pan = direction * (2 * t - 1), panL = Math.sqrt((1 - pan) / 2), panR = Math.sqrt((1 + pan) / 2);
    const center = d * noise * 12 + tonal, width = sideC * noise * 2;
    left[n] = (center + width) * envelope * panL;
    right[n] = (center - width) * envelope * panR;
  }
  let peak = 0;
  for (const channel of [left, right]) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const gain = .15 / Math.max(peak, 1e-8);
  for (const channel of [left, right]) for (let n = 0; n < length; n++) channel[n] *= gain;
  return {left, right};
}

function makeDroneFreeAir({seconds, seed, from, to, floor = 70, poles = 3, direction = 0, peakAt = .48, arch = false}) {
  const length = Math.round(seconds * SR), left = new Float32Array(length), right = new Float32Array(length);
  const random = rng(seed), randomSide = rng(seed ^ 0xc2b2ae35);
  const centerStages = new Float64Array(4), sideStages = new Float64Array(4);
  let centerFloor = 0, sideFloor = 0;
  for (let n = 0; n < length; n++) {
    const t = n / (length - 1);
    const travel = arch ? Math.sin(Math.PI * t) : smooth(t);
    const cutoff = lerp(from, to, travel), alpha = 1 - Math.exp(-2 * Math.PI * cutoff / SR);
    let center = random(), side = randomSide();
    for (let stage = 0; stage < poles; stage++) {
      centerStages[stage] += alpha * (center - centerStages[stage]); center = centerStages[stage];
      sideStages[stage] += alpha * (side - sideStages[stage]); side = sideStages[stage];
    }
    const floorAlpha = 1 - Math.exp(-2 * Math.PI * floor / SR);
    centerFloor += floorAlpha * (center - centerFloor); sideFloor += floorAlpha * (side - sideFloor);
    center -= centerFloor; side = (side - sideFloor) * .42;
    const rise = smooth(Math.min(1, t / peakAt)), fall = smooth(Math.min(1, (1 - t) / (1 - peakAt)));
    const envelope = rise * fall, pan = direction * (2 * t - 1);
    const panL = Math.sqrt((1 - pan) / 2), panR = Math.sqrt((1 + pan) / 2);
    left[n] = (center + side) * envelope * panL;
    right[n] = (center - side) * envelope * panR;
  }
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
  fs.writeFileSync(path.join(root, name), output);
}

const studies = {
  'pillowy-air-cotton-drift.wav': {seconds: 1.55, seed: 11, from: 340, to: 620, warmth: .88, tone: 150, direction: .08, shape: 'bloom'},
  'pillowy-air-velvet-bloom.wav': {seconds: 1.8, seed: 29, from: 240, to: 520, warmth: .96, tone: 105, direction: 0, shape: 'bloom'},
  'pillowy-air-cloud-lift.wav': {seconds: 1.45, seed: 47, from: 310, to: 1050, warmth: .8, tone: 185, direction: .18, shape: 'lift'},
  'pillowy-air-soft-exhale.wav': {seconds: 1.65, seed: 71, from: 820, to: 260, warmth: .92, tone: 135, direction: -.12, shape: 'exhale'},
};
const extremes = {
  'ultrasoft-air-deep-fleece.wav': {seconds: 2.1, seed: 101, from: 80, to: 150, noise: .85, tones: [[82, .025, 1.04]], direction: .04, peakAt: .52},
  'ultrasoft-air-cloud-cushion.wav': {seconds: 1.85, seed: 131, from: 110, to: 170, noise: .04, tones: [[110, .09, 1.12], [165, .045, 1.1], [220, .02, 1.08]], direction: .08, peakAt: .46},
  'ultrasoft-air-warm-breath.wav': {seconds: 1.7, seed: 167, from: 130, to: 260, noise: .4, tones: [[132, .035, 1.18], [198, .014, 1.15]], direction: -.08, peakAt: .38},
  'ultrasoft-air-feather-lift.wav': {seconds: 1.55, seed: 193, from: 160, to: 390, noise: .12, tones: [[175, .06, 1.45], [263, .024, 1.4], [350, .012, 1.35]], direction: .18, peakAt: .58},
  'ultrasoft-air-distant-pillow.wav': {seconds: 2.4, seed: 229, from: 95, to: 125, noise: .16, tones: [[98, .055, 1.03], [147, .026, 1.025], [196, .012, 1.02]], direction: 0, peakAt: .5},
};
const middleStudies = {
  'softness-6-satin-rise.wav': {seconds: 1.4, seed: 263, from: 560, to: 1450, floor: 90, poles: 3, direction: .16, peakAt: .42},
  'softness-6.5-satin-retreat.wav': {seconds: 1.5, seed: 293, from: 1250, to: 480, floor: 85, poles: 3, direction: -.14, peakAt: .35},
  'softness-7-downy-pass.wav': {seconds: 1.65, seed: 317, from: 480, to: 880, floor: 75, poles: 3, direction: .28, peakAt: .5},
  'softness-7.5-rounded-bloom.wav': {seconds: 1.75, seed: 347, from: 330, to: 760, floor: 68, poles: 4, direction: .06, peakAt: .5, arch: true},
  'softness-8-feather-hush.wav': {seconds: 1.9, seed: 379, from: 280, to: 560, floor: 62, poles: 4, direction: -.08, peakAt: .44},
};
for (const [name, options] of Object.entries(studies)) writeWav(name, makeAir(options));
for (const [name, options] of Object.entries(extremes)) writeWav(name, makeExtreme(options));
for (const [name, options] of Object.entries(middleStudies)) writeWav(name, makeDroneFreeAir(options));
console.log(`Wrote ${Object.keys(studies).length + Object.keys(extremes).length + Object.keys(middleStudies).length} pillowy air studies to ${root}`);
