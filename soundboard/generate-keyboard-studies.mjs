import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SR = 48_000;
const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
const bursts = [[.10, .18, .29], [.52, .60], [.88, .96, 1.04, 1.16], [1.55, 1.63, 1.75], [2.10, 2.18, 2.31, 2.39], [2.73]];
const events = bursts.flat();

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function addStrike(channels, start, voice, velocity, pan, random, isRelease = false, spacebar = false) {
  const length = Math.round((isRelease ? voice.releaseLength : voice.length) * SR);
  const modes = (spacebar ? voice.spaceModes : voice.modes).map(([frequency, level, decay]) => ({
    frequency: frequency * (.975 + random() * .05), level, decay, phase: random() * Math.PI * 2,
  }));
  const [gl, gr] = [Math.sqrt((1 - pan) / 2), Math.sqrt((1 + pan) / 2)];
  let previousNoise = 0;
  for (let n = 0; n < length && start + n < channels[0].length; n++) {
    const t = n / SR;
    const white = random() * 2 - 1;
    const edge = white - previousNoise * .82; previousNoise = white;
    let sample = edge * voice.noise * Math.exp(-t / voice.noiseDecay);
    for (const mode of modes) sample += Math.sin(mode.phase + 2 * Math.PI * mode.frequency * t) * mode.level * Math.exp(-t / mode.decay);
    const attack = Math.min(1, t / .0008);
    sample *= attack * velocity * (isRelease ? voice.releaseLevel : 1);
    channels[0][start + n] += sample * gl;
    channels[1][start + n] += sample * gr;
  }
}

function render(voice, seed) {
  const length = Math.round(3.05 * SR), channels = [new Float32Array(length), new Float32Array(length)], random = rng(seed);
  events.forEach((at, index) => {
    const jitter = (random() - .5) * .012, velocity = .7 + random() * .3, pan = (random() - .5) * .32;
    const start = Math.round((at + jitter) * SR), spacebar = index === 8 || index === 15;
    addStrike(channels, start, voice, velocity, pan, random, false, spacebar);
    const releaseDelay = voice.releaseDelay * (.82 + random() * .36);
    addStrike(channels, start + Math.round(releaseDelay * SR), voice, velocity * .75, pan, random, true, spacebar);
  });
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  const gain = .18 / Math.max(peak, 1e-8);
  for (const channel of channels) for (let index = 0; index < channel.length; index++) channel[index] *= gain;
  return channels;
}

function write(name, [left, right]) {
  const bytes = left.length * 6, output = Buffer.alloc(44 + bytes);
  output.write('RIFF', 0); output.writeUInt32LE(36 + bytes, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(2, 22); output.writeUInt32LE(SR, 24);
  output.writeUInt32LE(SR * 6, 28); output.writeUInt16LE(6, 32); output.writeUInt16LE(24, 34); output.write('data', 36); output.writeUInt32LE(bytes, 40);
  let offset = 44;
  for (let n = 0; n < left.length; n++) for (const sample of [left[n], right[n]]) { output.writeIntLE(Math.round(sample * 8_388_607), offset, 3); offset += 3; }
  fs.writeFileSync(path.join(assets, name), output);
}

const common = {length: .065, releaseLength: .04, releaseDelay: .065, releaseLevel: .36};
const voices = {
  'keyboard-quiet-scissor.wav': {...common, noise: .13, noiseDecay: .0022, modes: [[1350, .24, .012], [2650, .12, .007], [4300, .035, .004]], spaceModes: [[390, .28, .025], [780, .1, .013], [1900, .045, .008]]},
  'keyboard-crisp-scissor.wav': {...common, noise: .21, noiseDecay: .0016, modes: [[1750, .2, .009], [3300, .13, .005], [5600, .045, .003]], spaceModes: [[460, .25, .021], [1050, .1, .011], [2400, .055, .006]]},
  'keyboard-muted-mechanical.wav': {...common, length: .085, releaseDelay: .082, noise: .1, noiseDecay: .0028, modes: [[620, .2, .022], [1280, .16, .015], [2450, .075, .008]], spaceModes: [[230, .3, .04], [510, .16, .026], [1180, .07, .013]]},
  'keyboard-soft-membrane.wav': {...common, length: .075, releaseDelay: .075, releaseLevel: .27, noise: .075, noiseDecay: .0035, modes: [[480, .27, .02], [920, .105, .012], [1700, .035, .006]], spaceModes: [[205, .32, .035], [430, .12, .02], [880, .04, .01]]},
  'keyboard-low-profile.wav': {...common, noise: .16, noiseDecay: .002, modes: [[980, .19, .014], [2050, .14, .009], [3700, .04, .004]], spaceModes: [[340, .27, .028], [720, .11, .016], [1650, .05, .008]]},
};
for (const [name, voice] of Object.entries(voices)) write(name, render(voice, name.length * 733));
console.log(`Wrote ${Object.keys(voices).length} keyboard studies to ${assets}`);
