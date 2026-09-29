import {OnePole, Sine, Svf, clamp, gateEnv, mtof, panGains, samples, SR, type Rng} from './dsp';
import type {ScoreCues, Span} from './cues';
import type {Mix, Route} from './voices';

/*
 * Rounded digital voices for the Tidepool, Lumen and Windup concepts. Every tone is built from
 * sines (modal resonators, gliding blips, breathing pads), so nothing buzzes under the narration.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (random: Rng) => random() * 2 - 1;

/** [frequency ratio, gain, 1/e decay seconds]. */
export type Partial = readonly [number, number, number];

export const MARIMBA: readonly Partial[] = [[1, 1, .5], [3.93, .32, .11], [9.2, .07, .035]];
export const KALIMBA: readonly Partial[] = [[1, 1, 1.1], [1.004, .35, .9], [5.4, .16, .1], [11.8, .04, .03]];
export const GLASS: readonly Partial[] = [[1, 1, 1.6], [2, .22, .55], [3, .07, .22]];
export const MUSIC_BOX: readonly Partial[] = [[1, 1, 1.4], [3, .18, .35], [5.93, .12, .12], [11.3, .05, .04]];
export const WOOD: readonly Partial[] = [[1, 1, .045], [2.61, .45, .022], [4.4, .2, .012]];
export const VIBE: readonly Partial[] = [[1, 1, 2.2], [4, .2, .4], [10, .03, .06]];

/**
 * Struck resonator: each partial is an exact damped sine (two-pole recursion), under a short band-passed
 * mallet. Softer strikes lose their upper partials first.
 */
export function modal(mix: Mix, time: number, midi: number, velocity: number, route: Route, partials: readonly Partial[], options: {
  mallet?: number; malletLevel?: number; attack?: number; length?: number; name?: string;
} = {}) {
  const hz = mtof(midi);
  const length = options.length ?? Math.min(6, Math.max(...partials.map(p => p[2])) * 5 + .05);
  const out = buffer(length);
  partials.forEach(([ratio, gain, decay], index) => {
    const f = hz * ratio;
    if (f > 16_000) return;
    const w = 2 * Math.PI * f / SR, r = Math.exp(-1 / (decay * SR)), c = 2 * r * Math.cos(w), r2 = r * r;
    const amplitude = gain * (.35 + .65 * velocity) ** index;
    let y1 = 0, y2 = 0, first = amplitude * Math.sin(w);
    for (let i = 0; i < out.length; i++) {
      const y = c * y1 - r2 * y2 + first; first = 0;
      y2 = y1; y1 = y; out[i] += y;
    }
  });
  const attack = samples(options.attack ?? .0012), mallet = new Svf(), malletHz = options.mallet ?? 1800, malletLevel = options.malletLevel ?? .25;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    mallet.process(noise(mix.random), malletHz, .9);
    out[i] = (out[i] * (i < attack ? Math.sin(i / attack * Math.PI / 2) : 1) + mallet.bp * Math.exp(-t / .004) * malletLevel) * velocity * .22;
  }
  mix.emit(time, route, out); mix.count(options.name ?? 'modal');
}

/** Sine blip that settles into its pitch from `bend` semitones away: the basic "agent" chirp. */
export function blip(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {
  length?: number; bend?: number; bendTime?: number; warmth?: number; decay?: number;
} = {}) {
  const length = options.length ?? .12, bend = options.bend ?? 5, bendTime = options.bendTime ?? .018, warmth = options.warmth ?? .2;
  const decay = options.decay ?? length * .45;
  const out = buffer(length + .03), osc = new Sine(), third = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, f = hz * 2 ** (bend * Math.exp(-t / bendTime) / 12);
    const env = (t < .003 ? t / .003 : Math.exp(-(t - .003) / decay)) * (t > length ? Math.max(0, 1 - (t - length) / .03) : 1);
    out[i] = (osc.next(f) + warmth * third.next(f * 2) * Math.exp(-t / .03)) * env * velocity * .24;
  }
  mix.emit(time, route, out); mix.count('blip');
}

/** Water-drop bubble: a sine whose pitch rises through the drop. */
export function bubble(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {rise?: number; length?: number} = {}) {
  const length = options.length ?? .09, rise = options.rise ?? 9;
  const out = buffer(length), osc = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, p = t / length;
    const env = Math.min(1, t / .002) * (1 - p) ** 2;
    out[i] = osc.next(hz * 2 ** ((rise * (1 - Math.exp(-t / (length * .35))) - rise * .5) / 12)) * env * velocity * .26;
  }
  mix.emit(time, route, out); mix.count('bubble');
}

/** Rubber spring: a sine that wobbles fast then settles, gliding down. */
export function boing(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {length?: number; drop?: number; rate?: number} = {}) {
  const length = options.length ?? .35, drop = options.drop ?? 4, rate = options.rate ?? 19;
  const out = buffer(length), osc = new Sine(), hz = mtof(midi), soft = OnePole.lowpass(3000);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, p = t / length;
    const f = hz * 2 ** ((-drop * p + 1.2 * Math.sin(2 * Math.PI * rate * t) * Math.exp(-t / (length * .3))) / 12);
    out[i] = soft.process(osc.next(f)) * Math.min(1, t / .002) * Math.exp(-t / (length * .32)) * velocity * .26;
  }
  mix.emit(time, route, out); mix.count('boing');
}

/** Air glide: pink-ish noise through a moving band, optionally riding a soft sine tone. The motion voice. */
export function glide(mix: Mix, time: number, duration: number, route: Route, options: {
  from: number; to: number; level: number; panFrom?: number; panTo?: number; peak?: number; q?: number; tone?: [number, number]; toneLevel?: number;
}) {
  if (duration <= 0) return;
  const tail = .25, left = buffer(duration + tail), right = buffer(duration + tail);
  const peak = options.peak ?? .5, q = options.q ?? .9;
  const ears = [0, 1].map(() => ({band: new Svf(), low: OnePole.lowpass(3800), smooth: OnePole.lowpass(9000)}));
  const tone = new Sine();
  for (let i = 0; i < left.length; i++) {
    const t = i / SR, p = clamp(t / duration);
    const shaped = p < peak ? Math.sin(p / peak * Math.PI / 2) ** 2 : Math.cos((p - peak) / (1 - peak) * Math.PI / 2) ** 1.5;
    const env = t > duration ? shaped * Math.exp(-(t - duration) / .07) : shaped;
    const hz = options.from * (options.to / options.from) ** (p * p * (3 - 2 * p));
    const [a, b] = ears.map(ear => { ear.band.process(ear.smooth.process(noise(mix.random)), hz, q); return ear.low.process(ear.band.bp); });
    let mid = (a + b) * .5;
    if (options.tone) mid += tone.next(mtof(options.tone[0] + (options.tone[1] - options.tone[0]) * p)) * (options.toneLevel ?? .12);
    const side = (a - b) * .35, pan = (options.panFrom ?? 0) + ((options.panTo ?? 0) - (options.panFrom ?? 0)) * p;
    const [gl, gr] = panGains(pan), g = env * options.level * 1.6;
    left[i] = (mid + side) * gl * Math.SQRT2 * g; right[i] = (mid - side) * gr * Math.SQRT2 * g;
  }
  mix.emit(time, route, left, right); mix.count('glide');
}

/**
 * Breathing pad: three slightly detuned sines per note with a whisper of third harmonic, a slow
 * brightness swell and per-voice stereo drift. Warm and round; it never masks consonants.
 */
export function glowPad(mix: Mix, start: number, end: number, notes: readonly number[], route: Route, options: {
  attack?: number; release?: number; level?: number; bright?: number; breathe?: number;
} = {}) {
  const attack = options.attack ?? 1.4, release = options.release ?? 1.8, bright = options.bright ?? .25, breathe = options.breathe ?? .18;
  const length = Math.max(.05, end - start), left = buffer(length + release), right = buffer(length + release);
  notes.forEach((midi, n) => {
    const voices = [-7, 0, 6].map((cents, v) => ({a: new Sine(mix.random()), b: new Sine(mix.random()), hz: mtof(midi + cents / 100), pan: (v - 1) * .6 + (n % 2 ? .1 : -.1), phase: mix.random() * 6.28}));
    for (let i = 0; i < left.length; i++) {
      const t = i / SR, env = gateEnv(t, attack, Math.max(0, length - attack), release);
      if (env === 0 && t > attack) continue;
      let l = 0, r = 0;
      for (const voice of voices) {
        const swell = 1 - breathe + breathe * Math.sin(2 * Math.PI * .13 * t + voice.phase);
        const value = voice.a.next(voice.hz) * swell + voice.b.next(voice.hz * 3) * bright * .18 * swell;
        const [gl, gr] = panGains(voice.pan); l += value * gl; r += value * gr;
      }
      left[i] += l * env; right[i] += r * env;
    }
  });
  const level = (options.level ?? 1) * .05 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { left[i] *= level; right[i] *= level; }
  mix.emit(start, route, left, right); mix.count('glowPad');
}

/** Sparse high glass grains drawn from `pool`: the shimmer layer of the bed. */
export function shimmer(mix: Mix, start: number, end: number, pool: readonly number[], density: number, route: Route, options: {level?: number; partials?: readonly Partial[]} = {}) {
  for (let t = start + mix.random() / density; t < end; t += (.4 + mix.random() * 1.2) / density) {
    const midi = pool[Math.floor(mix.random() * pool.length)];
    modal(mix, t, midi, (.25 + .3 * mix.random()) * (options.level ?? 1), {...route, pan: (mix.random() * 2 - 1) * .8}, options.partials ?? GLASS, {mallet: 7000, malletLevel: 0, attack: .012, name: 'shimmer'});
  }
}

/** Brushed noise stroke: the soft backbeat and the hat of these kits. */
export function brush(mix: Mix, time: number, velocity: number, route: Route, options: {length?: number; hz?: number; attack?: number} = {}) {
  const length = options.length ?? .16, attack = options.attack ?? .012, out = buffer(length), band = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    band.process(noise(mix.random), options.hz ?? 3400, .6);
    out[i] = band.bp * (t < attack ? t / attack : Math.exp(-(t - attack) / (length * .3))) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('brush');
}

/** Round, clickless kick: a sine falling from ~2 octaves up onto `midi`. */
export function softKick(mix: Mix, time: number, velocity: number, route: Route, midi = 33) {
  const out = buffer(.4), osc = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.tanh(osc.next(hz * (1 + 2.2 * Math.exp(-t / .022))) * 1.3) * Math.min(1, t / .0015) * Math.exp(-t / .16) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('softKick');
}

/** Karplus-Strong plucked string, darkened: upright-ish bass and nylon plucks. */
export function string(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {length?: number; damping?: number; bright?: number} = {}) {
  const hz = mtof(midi), period = SR / hz, size = Math.floor(period), fraction = period - size;
  const length = options.length ?? 1.4, out = buffer(length), line = new Float32Array(size);
  const pre = OnePole.lowpass(600 + 5000 * (options.bright ?? .4) * velocity);
  for (let i = 0; i < line.length; i++) line[i] = pre.process(noise(mix.random));
  const damping = options.damping ?? .996;
  let index = 0, last = 0;
  for (let i = 0; i < out.length; i++) {
    const a = line[index], b = line[(index + 1) % size];
    const value = a + (b - a) * fraction;
    const next = (value + last) * .5 * damping; last = value;
    line[index] = next; index = (index + 1) % size;
    out[i] = value * velocity * .5 * (i > out.length - 480 ? (out.length - i) / 480 : 1);
  }
  mix.emit(time, route, out); mix.count('string');
}

/** Warm sine sub with a slow attack: the floor of the bed. */
export function sub(mix: Mix, start: number, end: number, midi: number, route: Route, options: {level?: number; attack?: number; release?: number} = {}) {
  const attack = options.attack ?? .08, release = options.release ?? .4, length = Math.max(.02, end - start);
  const out = buffer(length + release), osc = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.tanh(osc.next(hz) * 1.2) * gateEnv(t, attack, Math.max(0, length - attack), release) * (options.level ?? 1) * .3;
  }
  mix.emit(start, route, out); mix.count('sub');
}

/** Very quiet filtered room air under a whole section, so silence never reads as dropout. */
export function air(mix: Mix, start: number, end: number, route: Route, options: {level?: number; hz?: number} = {}) {
  const length = end - start; if (length <= 0) return;
  const left = buffer(length), right = buffer(length), filters = [OnePole.lowpass(options.hz ?? 700), OnePole.lowpass(options.hz ?? 700)], high = [new Svf(), new Svf()];
  for (let i = 0; i < left.length; i++) {
    const t = i / SR, env = gateEnv(t, 1.5, Math.max(0, length - 3), 1.5) * (options.level ?? 1) * .05;
    for (const [c, out] of [left, right].entries()) { high[c].process(filters[c].process(noise(mix.random)), 90, .7); out[i] = high[c].hp * env; }
  }
  mix.emit(start, route, left, right); mix.count('air');
}

// ---------------------------------------------------------------- time helpers

/** A steady tempo whose downbeat is pinned to `anchor`. */
export const pulse = (anchor: number, beat: number) => ({
  beat,
  at: (index: number) => anchor + index * beat,
  /** Beat indices whose time falls inside [start, end), at `per` subdivisions per beat. */
  steps: (start: number, end: number, per = 1) => {
    const out: {time: number; index: number}[] = [];
    for (let k = Math.ceil((start - anchor) / beat * per - 1e-6); anchor + k * beat / per < end - 1e-6; k++) out.push({time: anchor + k * beat / per, index: k / per});
    return out;
  },
});

/** The narration gaps longer than `min` seconds, for melodies that answer the voice. */
export function voiceGaps(cues: ScoreCues, min = .6): Span[] {
  const spans = cues.voice.length ? cues.voice : [];
  const gaps: Span[] = [];
  let cursor = 0;
  for (const span of spans) { if (span.at - cursor >= min) gaps.push({at: cursor, duration: span.at - cursor}); cursor = Math.max(cursor, span.at + span.duration); }
  if (cues.duration - cursor >= min) gaps.push({at: cursor, duration: cues.duration - cursor});
  return gaps;
}

/** True while the narrator is speaking at `time` (with a small margin). */
export const speaking = (cues: ScoreCues, time: number, margin = .08) => cues.voice.some(span => time > span.at - margin && time < span.at + span.duration + margin);

/** Pull the music bus down a few dB under every phrase; the foley bus stays untouched. */
export function voiceBed(mix: Mix, cues: ScoreCues, depth: number) {
  for (const span of cues.voice) mix.duck(span.at + .12, depth, .18, Math.max(0, span.duration - .25), .45);
}

/** Radial reveal order: pops nearest the circle's centre land first. */
export const radialPops = (cues: ScoreCues) => {
  const {circleGrow} = cues.issues.prelude;
  return cues.issues.pops.map(pop => ({...pop, at: circleGrow.at + .15 + circleGrow.duration * .8 * clamp(Math.hypot(pop.pan / .8, (pop.height - .5) * 2) / Math.SQRT2)}))
    .sort((a, b) => a.at - b.at);
};

// ---------------------------------------------------------------- harmony

/** One chord of a plan: `bass` root, `pad` voicing, from `at` until the next chord. */
export type Chord = {at: number; bass: number; pad: readonly number[]};

export const chordAt = (plan: readonly Chord[], time: number) => {
  let current = plan[0];
  for (const chord of plan) if (chord.at <= time + 1e-6) current = chord; else break;
  return current;
};

/** The `index`th chord tone at or above `floor` (bass and pad pitch classes), so foley always sits in the harmony. */
export function toneOf(chord: Chord, index: number, floor: number) {
  const classes = [...new Set([chord.bass, ...chord.pad].map(midi => ((midi % 12) + 12) % 12))];
  const ladder: number[] = [];
  for (let midi = floor; ladder.length < index + 1; midi++) if (classes.includes(((midi % 12) + 12) % 12)) ladder.push(midi);
  return ladder[index];
}

/** Hold every chord of `plan` inside [start, end) with `play`. */
export function eachChord(plan: readonly Chord[], start: number, end: number, play: (chord: Chord, from: number, to: number) => void) {
  plan.forEach((chord, i) => {
    const from = Math.max(start, chord.at), to = Math.min(end, plan[i + 1]?.at ?? Infinity);
    if (to > from + .05) play(chord, from, to);
  });
}
