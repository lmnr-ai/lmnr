import {OnePole, Saw, Sine, Svf, gateEnv, mtof, pluckEnv, samples, type Rng} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * The tactile palette (LAM-2320 v2). The reference's mids and highs are hits, not tones: 95 % of its energy above
 * 2 kHz is transient, against 7 % for v1's sine keys and glass. And every hit has a small room right behind it — its
 * L/R correlation falls from ~.5 at the onset to ~.2 within 10 ms — so `place` gives each voice its own early
 * reflections before the shared room. The sub is re-struck every eighth and saturated, so it grooves and reaches
 * ~500 Hz on small speakers; a low-mid `thump` marks each onset.
 */

const SR = 48_000;
const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (random: Rng) => random() * 2 - 1;
class Pink {
  private b0 = 0; private b1 = 0; private b2 = 0;
  next(random: Rng) {
    const white = noise(random);
    this.b0 = .99765 * this.b0 + white * .099046; this.b1 = .963 * this.b1 + white * .2965164; this.b2 = .57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * .1848) * .25;
  }
}

// Early-reflection taps (ms) per ear: interleaved, so the ears decorrelate within ~10 ms; gains fall -3 → -18 dB with alternating sign.
const TAPS: readonly [number, number][][] = [[3.1, 5.3, 7.9, 11.2, 13.7, 17.3, 19.9, 23.1], [2.7, 4.6, 8.8, 10.4, 14.9, 16.1, 21.0, 22.4]]
  .map(ear => ear.map((ms, k) => [Math.round(ms * SR / 1000), (k % 2 ? -1 : 1) * 10 ** ((-3 - 15 * k / 7) / 20)] as [number, number]));
const REACH = Math.round(.024 * SR);

/** Pan a mono voice and add its early reflections (low-passed at 8 kHz), `amount` 0 dry … 1 full. */
export function place(dry: Float32Array, pan: number, amount: number): [Float32Array, Float32Array] {
  const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4, gains = [Math.cos(angle), Math.sin(angle)];
  const ears = [0, 1].map(ear => {
    const out = new Float32Array(dry.length + REACH), smooth = OnePole.lowpass(8000), taps = TAPS[ear];
    for (let n = 0; n < out.length; n++) {
      let reflected = 0;
      for (const [lag, gain] of taps) { const m = n - lag; if (m >= 0 && m < dry.length) reflected += dry[m] * gain; }
      out[n] = (n < dry.length ? dry[n] * gains[ear] : 0) + smooth.process(reflected) * amount * .5;
    }
    return out;
  });
  return [ears[0], ears[1]];
}

/** Strike offsets inside a held sub note: every eighth, plus one syncopated sixteenth push per bar. */
export const strikes = (hold: number, every = .25, push = .875) =>
  [...Array.from({length: Math.max(1, Math.ceil(hold / every))}, (_, k) => k * every), ...(push < hold - .05 ? [push] : [])].sort((a, b) => a - b);

/**
 * The struck sub: a sine through an asymmetric soft clip (H2–H6 at -15…-29 dB, like the reference's), then a 2-pole
 * low-pass that opens to 2.4 kHz on every strike and closes to 900 Hz (τ 90 ms). Each strike rises in 10 ms and
 * decays with τ `decay` toward `floor` (≈ -5 dB per eighth by default), so a held note grooves; the gate releases it into the bar's gap.
 */
export function sub(mix: Mix, time: number, midi: number, hold: number, velocity: number, route: Route, options: {
  attack?: number; release?: number; drift?: number; drive?: [number, number]; bend?: number; bendTime?: number;
  decay?: number; hits?: readonly number[]; floor?: number;
} = {}) {
  if (hold <= 0 || velocity <= 0) return;
  const attack = options.attack ?? .012, release = options.release ?? .15, drift = options.drift ?? -1, [driveFrom, driveTo] = options.drive ?? [2.8, 2.2];
  const bend = options.bend ?? 1.3, bendTime = options.bendTime ?? .025, decay = options.decay ?? .43, floor = options.floor ?? .55;
  const hits = (options.hits ?? strikes(hold)).map(offset => Math.round(offset * SR));
  const out = buffer(attack + hold + release + .01), osc = new Sine(), lowpass = new Svf(), block = new Svf(), hz = mtof(midi);
  let level = 0, from = 0, struck = 0, next = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    if (next < hits.length && i >= hits[next]) { struck = hits[next++]; from = level; }
    const since = (i - struck) / SR, rise = Math.min(1, since / .01);
    level = (from + (1 - from) * rise) * (rise < 1 ? 1 : Math.exp(-(since - .01) / decay));
    const glide = 2 ** ((bend * Math.exp(-t / bendTime) + drift * (1 - Math.exp(-t / (hold * .7 + .05)))) / 12);
    const x = osc.next(hz * glide), drive = driveTo + (driveFrom - driveTo) * Math.exp(-since / .3);
    const shaped = (Math.tanh(drive * (x + .2)) - Math.tanh(drive * .2)) / Math.tanh(drive);
    lowpass.process(shaped, 900 + 1500 * Math.exp(-since / .09), .707);
    block.process(lowpass.lp, 12, .707);
    out[i] = block.hp * gateEnv(t, attack, hold, release) * (floor + (1 - floor) * level) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('sub');
}

/** The onset thump: band-passed noise at 110 Hz under a sine falling 160 → 70 Hz, 3 ms in, 45 ms out. */
export function thump(mix: Mix, time: number, velocity: number, route: Route, pan = 0) {
  const out = buffer(.3), osc = new Sine(), band = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    band.process(noise(mix.random), 110, 1.2);
    out[i] = (osc.next(70 + 90 * Math.exp(-t / .012)) * .8 + band.bp * 1.6) * pluckEnv(t, .003, .06) * velocity * .8;
  }
  const [l, r] = place(out, pan, .8);
  mix.emit(time, route, l, r); mix.count('thump');
}

/** A felt pluck: sine plus a fading octave, a 2 ms noise click at 2.5 kHz, and a low-pass closing 3 kHz → 900 Hz. */
export function pluck(mix: Mix, time: number, midi: number, velocity: number, route: Route, pan: number, options: {decay?: number} = {}) {
  const decay = options.decay ?? .11, hz = mtof(midi);
  const out = buffer(decay * 5 + .03), a = new Sine(), b = new Sine(), soften = new Svf(), click = new Svf(), floor = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    click.process(noise(mix.random), 2500, .9);
    const tone = a.next(hz) + .6 * b.next(hz * 2) * Math.exp(-t / (decay * .5));
    soften.process(tone, 900 + 2100 * Math.exp(-t / .06), .707);
    floor.process(soften.lp + click.bp * .2 * Math.exp(-t / .002), 90, .707);
    out[i] = floor.hp * pluckEnv(t, .002, decay) * velocity * .6;
  }
  const [l, r] = place(out, pan, .7);
  mix.emit(time, route, l, r); mix.count('pluck');
}

// Allpass decorrelators per ear (ms), so a glass partial is wide without being a doubled echo.
const DIFFUSE = [[3.1, 7.3, 11.9, 17.7], [4.3, 6.1, 13.1, 15.9]];
class Allpass {
  private line: Float32Array; private index = 0;
  constructor(ms: number, private gain = .5) { this.line = new Float32Array(Math.round(ms * SR / 1000)); }
  process(input: number) {
    const delayed = this.line[this.index], output = delayed - this.gain * input;
    this.line[this.index] = input + this.gain * output; this.index = (this.index + 1) % this.line.length;
    return output;
  }
}

/**
 * Glass: a 1 ms noise strike over a sine pair (the right ear ×1.0006), each ear through its own allpass chain.
 * Short by default (120 ms); `decay` > .5 and an `attack` make the long, swelled glass of the hits and the logo.
 * `tone` low-passes it (the hidden-insights section sits under 6 kHz).
 */
export function glass(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number; attack?: number; pan?: number; tone?: number} = {}) {
  const decay = options.decay ?? .08, attack = options.attack ?? .001, pan = options.pan ?? 0, hz = mtof(midi);
  const length = samples(attack + decay * 5 + .04), angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  const ears = [0, 1].map(ear => {
    const out = new Float32Array(length), a = new Sine(), b = new Sine(), strike = new Svf(), chain = DIFFUSE[ear].map(ms => new Allpass(ms, .5)), tone = OnePole.lowpass(options.tone ?? 16_000);
    const detune = ear ? 1.0006 : 1, gain = ear ? Math.sin(angle) : Math.cos(angle);
    for (let i = 0; i < length; i++) {
      const t = i / SR;
      strike.process(noise(mix.random), Math.min(hz * 2, 12_000), .8);
      const value = (a.next(hz * detune) + .14 * b.next(hz * 2.76 * detune) * Math.exp(-t / (decay * .25))) * pluckEnv(t, attack, decay) + strike.bp * .5 * Math.exp(-t / .001);
      out[i] = tone.process(chain.reduce((x, allpass) => allpass.process(x), value)) * gain * velocity * .14;
    }
    return out;
  });
  // Cross-blend the diffused ears (correlation ~.4): wide, but it still has a centre.
  const [l, r] = ears, left = l.map((x, i) => x + .5 * r[i]), right = r.map((x, i) => x + .5 * l[i]);
  mix.emit(time, route, left, right); mix.count('glass');
}

/** One grain: 0.5 ms in, τ 3 ms out — white noise high-passed at 5–9 kHz or band-passed at 3–6 kHz, picked per grain. */
export function grain(mix: Mix, time: number, velocity: number, route: Route, pan: number, options: {tone?: number; decay?: number} = {}) {
  const bright = mix.random() < .55, hz = options.tone ?? (bright ? 5000 + 4000 * mix.random() : 3000 + 3000 * mix.random()), decay = options.decay ?? .003;
  const out = buffer(decay * 7 + .002), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    filter.process(noise(mix.random), hz, bright ? .707 : 1.5);
    out[i] = (bright ? filter.hp : filter.bp * 1.6) * pluckEnv(i / SR, .0005, decay) * velocity * .16;
  }
  const [l, r] = place(out, pan, .5);
  mix.emit(time, route, l, r); mix.count('grain');
}

/** Crackle for the builds: 0.3 ms specks at `density(time)` per second, scattered across the field. */
export function crackle(mix: Mix, start: number, end: number, density: (time: number) => number, level: number, route: Route) {
  if (end <= start) return;
  const left = buffer(end - start), right = buffer(end - start), filters = [new Svf(), new Svf()];
  for (let i = 0; i < left.length; i++) {
    const t = start + i / SR;
    const speck = mix.random() < density(t) / SR ? (mix.random() * 2 - 1) * (.4 + .6 * mix.random()) : 0, side = mix.random();
    filters[0].process(speck * Math.sqrt(1 - side), 3000, .707); filters[1].process(speck * Math.sqrt(side), 3000, .707);
    left[i] = filters[0].hp * level * 4; right[i] = filters[1].hp * level * 4;
  }
  mix.emit(start, route, left, right); mix.count('crackle');
}

/** A noise band sweeping `fromHz` → `toHz` with a crescendo — the lift into a drop, kept above the voice. */
export function rise(mix: Mix, start: number, end: number, route: Route, options: {fromHz: number; toHz: number; level: number}) {
  const duration = end - start;
  if (duration <= 0) return;
  const left = buffer(duration), right = buffer(duration), bands = [new Svf(), new Svf()], pinks = [new Pink(), new Pink(), new Pink()];
  for (let i = 0; i < left.length; i++) {
    const progress = i / left.length, hz = options.fromHz * (options.toHz / options.fromHz) ** progress;
    const envelope = progress ** 2 * Math.min(1, (left.length - i) / 96) * options.level;
    // A shared core and a quieter private band per ear: wide, but correlated ~.6 like the reference's highs.
    const shared = pinks[2].next(mix.random);
    [left, right].forEach((ear, k) => { bands[k].process(shared * .8 + pinks[k].next(mix.random) * .6, hz, 2.2); ear[i] = bands[k].bp * envelope * 1.3; });
  }
  mix.emit(start, route, left, right); mix.count('rise');
}

/** Harmonics of `midi` with no fundamental: a saw high-passed at 90 Hz under a low-pass opening `fromHz` → `toHz`. */
export function overtones(mix: Mix, start: number, end: number, midi: number, route: Route, options: {fromHz: number; toHz: number; level: number}) {
  const duration = end - start;
  if (duration <= 0) return;
  const out = buffer(duration), saw = new Saw(), open = new Svf(), floor = new Svf(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const progress = i / out.length;
    open.process(saw.next(hz), options.fromHz * (options.toHz / options.fromHz) ** progress, 1.1);
    floor.process(open.lp, 90, .707);
    out[i] = floor.hp * progress ** 1.6 * Math.min(1, (out.length - i) / 96) * options.level;
  }
  mix.emit(start, route, out); mix.count('overtones');
}

/**
 * A chord bloom: six saws per note at ±12 cents, three per ear, low-passed at `cutoff`. It swells over `attack`, holds
 * and decays over `tail`. `reverse` makes it a pre-echo instead: it only rises (cubic), then cuts dead at the end.
 */
export function bloom(mix: Mix, start: number, notes: readonly number[], route: Route, options: {
  level: number; attack?: number; hold?: number; tail?: number; cutoff?: number; reverse?: boolean;
}) {
  const attack = options.attack ?? .15, hold = options.hold ?? 0, tail = options.tail ?? 3.5, cutoff = options.cutoff ?? 2500;
  const duration = options.reverse ? attack : attack + hold + tail;
  const length = samples(duration);
  const ears = [0, 1].map(ear => {
    const out = new Float32Array(length), voices = notes.flatMap(midi => [-12, -4, 8, -8, 4, 12].filter((_, k) => k % 2 === ear)
      .map(cents => ({saw: new Saw(mix.random()), hz: mtof(midi) * 2 ** (cents / 1200)})));
    const filter = new Svf(), floor = new Svf();
    for (let i = 0; i < length; i++) {
      const t = i / SR;
      let value = 0;
      for (const voice of voices) value += voice.saw.next(voice.hz);
      const envelope = options.reverse ? (t / attack) ** 3 * Math.min(1, (length - i) / 96)
        : t < attack ? Math.sin(t / attack * Math.PI / 2) : t < attack + hold ? 1 : Math.exp(-(t - attack - hold) / (tail / 4.6)) * Math.min(1, (length - i) / 480);
      filter.process(value, cutoff, .6); floor.process(filter.lp, 110, .707);
      out[i] = floor.hp * envelope * options.level / Math.sqrt(voices.length);
    }
    return out;
  });
  mix.emit(start, route, ears[0], ears[1]); mix.count('bloom');
}

/** A low drone of room tone: two independent pink ears band-passed at 140 Hz, faded by `level(time)` (smoothed over ~20 ms). */
export function drone(mix: Mix, start: number, end: number, level: (time: number) => number, route: Route) {
  if (end <= start) return;
  const left = buffer(end - start), right = buffer(end - start), ears = [0, 1].map(() => ({pink: new Pink(), band: new Svf()})), glide = OnePole.lowpass(8);
  for (let i = 0; i < left.length; i++) {
    const t = start + i / SR, gain = glide.process(level(t)) * Math.min(1, i / 9600, (left.length - i) / 9600);
    [left, right].forEach((ear, k) => { ears[k].band.process(ears[k].pink.next(mix.random), 140, .8); ear[i] = ears[k].band.bp * gain * 4; });
  }
  mix.emit(start, route, left, right); mix.count('drone');
}

/**
 * Speech carve: dip only 300 Hz–3 kHz of the music bus and its sends by `depth` under each phrase (60 ms attack,
 * 250 ms release), so the sub, grains and room stay full while the voice keeps its band. Linear and time-varying,
 * so layer stems still sum. Run after every music voice is emitted.
 */
export function carve(mix: Mix, phrases: readonly {at: number; duration: number}[], depth: number) {
  const keep = new Float32Array(mix.length).fill(1);
  for (const phrase of phrases) for (let n = Math.max(0, samples(phrase.at - .06)); n < Math.min(mix.length, samples(phrase.at + phrase.duration + .25)); n++) {
    const t = n / SR, into = (t - phrase.at + .06) / .06, out = (phrase.at + phrase.duration + .25 - t) / .25;
    keep[n] = Math.min(keep[n], 1 - (1 - depth) * Math.max(0, Math.min(1, into, out)));
  }
  for (const bus of [mix.music, mix.hall, mix.room, mix.delay]) for (const channel of [bus.l, bus.r]) {
    // Linkwitz–Riley crossovers (two Butterworth stages) isolate the band; the rest passes untouched.
    const low = [new Svf(), new Svf()], high = [new Svf(), new Svf()];
    for (let n = 0; n < channel.length; n++) {
      const x = channel[n];
      low[0].process(x, 300); low[1].process(low[0].lp, 300);
      high[0].process(x, 3000); high[1].process(high[0].hp, 3000);
      channel[n] = x - (1 - keep[n]) * (x - low[1].lp - high[1].hp);
    }
  }
}
