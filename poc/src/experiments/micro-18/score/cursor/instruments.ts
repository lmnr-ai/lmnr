import {OnePole, Sine, Svf, clamp, gateEnv, mtof, panGains, pluckEnv, samples, type Rng} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * The Cursor reference's palette ("Software is changing"), measured on its Demucs music stem:
 * a warm, sustained tape-organ bed (92 % of the energy is harmonic, under 0.4 % above 2 kHz) that
 * breathes at about 0.5 Hz, plus short paper-cutout knocks (20–80 ms, centred near 1.3 kHz),
 * low pitched thumps and fast tick ratchets. Nothing here is a piano sample.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (random: Rng) => random() * 2 - 1;

/** Tape wow and flutter in cents: one slow sway and a faint fast flutter, shared by a whole chord. */
const wow = (t: number, depth = 4) => depth * Math.sin(2 * Math.PI * .31 * t + 1.3) + .6 * Math.sin(2 * Math.PI * 5.1 * t);

export type TapePadOptions = {
  attack?: number; release?: number; level?: number;
  /** Low-pass cutoff at the start and end of the note (Hz). The reference stays under ~1.8 kHz. */
  cutoff?: [number, number];
  /** 0..1 depth of the slow ~0.54 Hz breathing swell the reference bed has. */
  breath?: number;
  /** Tape sag: `semitones` of pitch drift reached `at` seconds after the start, over `duration`. */
  bend?: {at: number; duration: number; semitones: number};
  /** Attack curve exponent; above 1 swells in late, like a reversed tape. */
  curve?: number;
};

/**
 * Warm tape organ: per note, two detuned additive voices (six soft partials, 1/k^1.6) panned apart,
 * through a gentle low-pass, with shared wow/flutter and a slow breathing swell.
 */
export function tapePad(mix: Mix, start: number, end: number, notes: readonly number[], route: Route, options: TapePadOptions = {}) {
  const attack = options.attack ?? 1.4, release = options.release ?? 1.8, hold = Math.max(0, end - start - attack);
  if (end <= start) return;
  const left = buffer(end - start + release), right = buffer(end - start + release);
  const [from, to] = options.cutoff ?? [700, 1400], breath = options.breath ?? .18, curve = options.curve ?? 1;
  const partials = [1, 2, 3, 4, 5, 6].map(k => k ** -1.6);
  notes.forEach((midi, index) => {
    const voices = [-5, 5].map((cents, v) => ({
      cents, pan: (v ? .55 : -.55) + (index % 2 ? .1 : -.1),
      oscillators: partials.map(() => new Sine(mix.random())),
    }));
    const filters = [new Svf(), new Svf()];
    const hz = mtof(midi);
    for (let i = 0; i < left.length; i++) {
      const t = i / 48_000;
      const raw = gateEnv(t, attack, hold, release);
      if (raw === 0 && t > attack) continue;
      const envelope = t < attack ? raw ** curve : raw;
      const progress = clamp(t / Math.max(.1, end - start));
      const cutoff = from + (to - from) * Math.sin(progress * Math.PI / 2);
      const bend = options.bend ? options.bend.semitones * clamp((t - options.bend.at) / options.bend.duration) : 0;
      const swell = 1 - breath * (.5 - .5 * Math.cos(2 * Math.PI * .54 * (start + t)));
      let l = 0, r = 0;
      for (const voice of voices) {
        const f = hz * 2 ** ((bend + (voice.cents + wow(start + t)) / 100) / 12);
        let value = 0;
        voice.oscillators.forEach((oscillator, k) => { value += oscillator.next(f * (k + 1)) * partials[k]; });
        const [gl, gr] = panGains(voice.pan);
        l += value * gl; r += value * gr;
      }
      left[i] += filters[0].process(l, cutoff, .6) * envelope * swell;
      right[i] += filters[1].process(r, cutoff, .6) * envelope * swell;
    }
  });
  const level = (options.level ?? 1) * .12 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { left[i] *= level; right[i] *= level; }
  mix.emit(start, route, left, right); mix.count('tapePad');
}

/** Held sine bass with a little second harmonic, a slow attack and the same wow as the bed. */
export function sub(mix: Mix, start: number, end: number, midi: number, route: Route, options: {attack?: number; release?: number; level?: number} = {}) {
  const attack = options.attack ?? .5, release = options.release ?? 1.4;
  if (end <= start) return;
  const out = buffer(end - start + release), osc = new Sine(), octave = new Sine(), soften = OnePole.lowpass(420);
  const hz = mtof(midi), hold = Math.max(0, end - start - attack);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, f = hz * 2 ** (wow(start + t, 2) / 1200);
    const value = Math.tanh((osc.next(f) + .22 * octave.next(2 * f)) * 1.2) / Math.tanh(1.2);
    out[i] = soften.process(value) * gateEnv(t, attack, hold, release) * (options.level ?? 1) * .12;
  }
  mix.emit(start, route, out); mix.count('sub');
}

export type KnockOptions = {decay?: number; wood?: number; click?: number; drop?: number; clickHz?: number; cents?: number};

/**
 * Paper-cutout knock: a body that falls into its pitch in ~6 ms, an inharmonic wooden mode and a
 * short band-passed click near 1.3 kHz. Low notes are the reference's thumps; high ones are its ticks.
 */
export function knock(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: KnockOptions = {}) {
  const decay = options.decay ?? .05, wood = options.wood ?? .45, clickLevel = options.click ?? .5, drop = options.drop ?? 1.1;
  const out = buffer(decay * 7 + .02), body = new Sine(), mode = new Sine(), click = new Svf(), soften = OnePole.lowpass(3600);
  const hz = mtof(midi) * 2 ** ((options.cents ?? 0) / 1200), clickHz = options.clickHz ?? 1300;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    click.process(noise(mix.random), clickHz, 1.2);
    const f = hz * (1 + drop * Math.exp(-t / .006));
    const value = body.next(f) * pluckEnv(t, .0008, decay)
      + mode.next(f * 2.76) * pluckEnv(t, .0005, decay * .35) * wood
      + click.bp * Math.exp(-t / .003) * clickLevel * 1.6;
    // Tape-style saturation: soft hits pass untouched, heavy thumps round off instead of spiking the master.
    out[i] = Math.tanh(soften.process(value) * velocity * .8) / 2;
  }
  mix.emit(time, route, out); mix.count('knock');
}

/** Soft wooden mallet: knock attack with a longer tone and the marimba's fourth-harmonic partial. */
export function mallet(mix: Mix, time: number, midi: number, velocity: number, route: Route, decay = .32) {
  const out = buffer(decay * 6), body = new Sine(), fourth = new Sine(), click = new Svf(), soften = OnePole.lowpass(3000);
  const hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    click.process(noise(mix.random), 1100, 1);
    const value = body.next(hz * (1 + .15 * Math.exp(-t / .004))) * pluckEnv(t, .001, decay)
      + fourth.next(hz * 4) * pluckEnv(t, .0008, decay * .18) * .25
      + click.bp * Math.exp(-t / .002) * .5;
    out[i] = Math.tanh(soften.process(value) * velocity * .6) / 2;
  }
  mix.emit(time, route, out); mix.count('mallet');
}

/** Tick ratchet from `start` to `end`: knocks whose rate glides `rate[0]` → `rate[1]` per second, over a pitch set. */
export function ratchet(mix: Mix, start: number, end: number, pitches: readonly number[], route: Route,
  options: {rate?: [number, number]; level?: [number, number]; pan?: [number, number]; human?: boolean} = {}) {
  const [r0, r1] = options.rate ?? [8, 16], [v0, v1] = options.level ?? [.12, .2], [p0, p1] = options.pan ?? [0, 0];
  for (let t = start, k = 0; t < end; k++) {
    const x = clamp((t - start) / Math.max(.01, end - start));
    const velocity = (v0 + (v1 - v0) * x) * (.85 + .3 * mix.random());
    // Human: every tick differs in decay, click colour, wood and pitch, with an accent per four, so a run never reads as a machine gun.
    const shape = options.human
      ? {decay: .012 * (.7 + .6 * mix.random()), wood: .1 + .25 * mix.random(), click: .8, drop: .6, clickHz: 1100 + 500 * mix.random(), cents: (mix.random() - .5) * 40}
      : {decay: .012, wood: .2, click: .8, drop: .6};
    const jitter = options.human ? .01 : .004;
    knock(mix, t + (mix.random() - .5) * jitter, pitches[k % pitches.length], velocity * (options.human && k % 4 === 0 ? 1.35 : 1), {...route, pan: p0 + (p1 - p0) * x}, shape);
    t += 1 / (r0 + (r1 - r0) * x);
  }
}

/**
 * Paper slide: the cutouts moving. Pink noise through a band that sweeps `from` → `to` (soft-capped at
 * 2.2 kHz), roughened with grain so it reads as paper rather than air, shaped by the move's speed.
 */
export function paper(mix: Mix, time: number, duration: number, route: Route,
  options: {level?: number; from?: number; to?: number; peak?: number; pan?: [number, number]; grain?: number} = {}) {
  if (duration <= 0) return;
  const tail = .12, left = buffer(duration + tail), right = buffer(duration + tail);
  const from = options.from ?? 500, to = options.to ?? 1400, peak = options.peak ?? .45, grain = options.grain ?? .6;
  const [pan0, pan1] = options.pan ?? [-.3, .3];
  const ears = [0, 1].map(() => ({b0: 0, b1: 0, b2: 0, band: new Svf(), body: new Svf(), crackle: 0}));
  const cap = (hz: number) => hz * 2200 / (hz + 2200);
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, x = clamp(t / duration);
    const shaped = x < peak ? Math.sin(x / peak * Math.PI / 2) ** 2 : Math.cos((x - peak) / (1 - peak) * Math.PI / 2) ** 1.3;
    const envelope = t > duration ? shaped * Math.exp(-(t - duration) / .04) : shaped;
    const cutoff = cap(from * (to / from) ** (x < peak ? x / peak : 1 - .4 * (x - peak) / (1 - peak)));
    const [a, b] = ears.map(ear => {
      const white = noise(mix.random);
      ear.b0 = .99765 * ear.b0 + white * .099046; ear.b1 = .963 * ear.b1 + white * .2965164; ear.b2 = .57 * ear.b2 + white * 1.0526913;
      const pink = (ear.b0 + ear.b1 + ear.b2 + white * .1848) * .25;
      // Grain: sparse short bursts, denser at the move's peak.
      if (mix.random() < .0012 * (.3 + shaped)) ear.crackle = 1;
      ear.crackle *= .995;
      ear.band.process(pink, cutoff, 1.1); ear.body.process(pink, cutoff * .4, .8);
      return (ear.band.bp * (1 - grain + grain * (.35 + ear.crackle)) + ear.body.bp * .3);
    });
    const [gl, gr] = panGains(pan0 + (pan1 - pan0) * x), g = envelope * (options.level ?? .5) * 2.2;
    left[i] = Math.tanh(a * gl * Math.SQRT2 * g * 2) / 2; right[i] = Math.tanh(b * gr * Math.SQRT2 * g * 2) / 2;
  }
  mix.emit(time, route, left, right); mix.count('paper');
}
