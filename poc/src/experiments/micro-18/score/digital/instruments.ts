import {OnePole, Saw, Sine, Svf, clamp, mtof, panGains, pluckEnv} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * The digital reference's palette (LAM-2315): a driven 808 sub that carries most of the energy, hard-gated
 * saw chord blocks that start and stop on a sample, square "data" blips, pitch-drop zaps and crisp hats.
 * Everything is near mono and nothing fades: sound is switched on and off, and silence is the punctuation.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, Math.round(duration * 48_000)));
const noise = (mix: Mix) => mix.random() * 2 - 1;
/** Hard gate: a 2 ms on, a 4 ms off. Long enough not to click, short enough to read as a switch. */
const gate = (t: number, length: number) => t < 0 || t > length ? 0 : Math.min(1, t / .002, (length - t) / .004);

/** 808: a driven sine that drops from `drop` semitones above its note in ~60 ms, so hits read as a "zap" into the sub. */
export function sub808(mix: Mix, time: number, midi: number, duration: number, velocity: number, route: Route, options: {drop?: number; fall?: number; drive?: number; decay?: number} = {}) {
  const drop = options.drop ?? 24, fall = options.fall ?? .045, drive = options.drive ?? 2.4, decay = options.decay ?? 9;
  const out = buffer(duration), osc = new Sine(), click = OnePole.lowpass(2400), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const value = Math.tanh(osc.next(hz * 2 ** (drop * Math.exp(-t / fall) / 12)) * drive) / Math.tanh(drive);
    const snap = click.process(noise(mix)) * Math.exp(-t / .0015);
    out[i] = (value * Math.exp(-t / decay) + snap * .6) * gate(t, duration) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('sub808');
}

/**
 * A gated chord block: two detuned saws per tone under a low-pass, plus a saw an octave under the root for the
 * reference's buzzing low stack. `crush` sample-holds the block at that rate for a grittier, digital read.
 * `pulse` gates it into 60%-duty steps of that length (from `start`), so a chord under the voice moves instead of droning.
 */
export function block(mix: Mix, start: number, end: number, tones: readonly number[], route: Route, options: {cutoff?: [number, number]; level?: number; root?: number; crush?: number; q?: number; swell?: boolean; pulse?: number} = {}) {
  const duration = Math.max(.02, end - start), [from, to] = options.cutoff ?? [700, 1100], level = (options.level ?? 1) * .2 / Math.sqrt(tones.length + 1);
  const out = buffer(duration), filter = new Svf(), low = new Svf();
  const oscillators = tones.flatMap(midi => [-7, 6].map(cents => ({saw: new Saw(mix.random()), hz: mtof(midi + cents / 100)})));
  const root = options.root === undefined ? undefined : {saw: new Saw(mix.random()), hz: mtof(options.root)};
  const hold = options.crush ? Math.max(1, Math.round(48_000 / options.crush)) : 1;
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    let value = 0;
    for (const oscillator of oscillators) value += oscillator.saw.next(oscillator.hz);
    const cutoff = from + (to - from) * clamp(t / duration);
    // A little of the unfiltered buzz above the cutoff gives the blocks the reference's 1-4 kHz edge.
    value = filter.process(value, cutoff, options.q ?? .9) + filter.hp * .1;
    if (root) value += low.process(root.saw.next(root.hz), 260, .7) * 2.2;
    if (i % hold === 0) held = value;
    // `swell` is a reversed block: it blooms into its end and is cut there, the breath in before a hit.
    const step = options.pulse ? gate(t % options.pulse, options.pulse * .6) : 1;
    out[i] = held * gate(t, duration) * step * level * (options.swell ? (t / duration) ** 3 * 1.6 : 1);
  }
  mix.emit(start, route, out); mix.count('block');
}

/**
 * Data tap: the reference's square blip made tactile. A 3.5 kHz transient, a body two octaves under the note that
 * drops a further octave in 6 ms, and the square tone (odd harmonics under 6 kHz, with a +7-cent twin) under a
 * low-pass closing from `bright` to 1.2 kHz in 15 ms. `length` is the tone's decay. Hero hits pass `exact`; the rest
 * vary by ±1.5 dB and ±3 ms so repeats don't read as a machine gun.
 */
export function blip(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .035, options: {bright?: number; exact?: boolean; body?: number} = {}) {
  const jitter = options.exact ? 0 : (mix.random() - .5) * .006, humane = options.exact ? 1 : 10 ** ((mix.random() - .5) * 3 / 20);
  const tau = Math.max(.012, length), out = buffer(Math.min(.5, tau * 5 + .01)), hz = mtof(midi);
  const harmonics = [1, 3, 5].filter(k => k * hz < 6000), tones = harmonics.map(() => [new Sine(), new Sine()]);
  const lowpass = new Svf(), snap = new Svf(), body = new Sine(), bright = options.bright ?? 7000, weight = options.body ?? .5;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    let square = 0;
    harmonics.forEach((k, index) => { square += (tones[index][0].next(hz * k) + .3 * tones[index][1].next(hz * k * 2 ** (7 / 1200))) / k; });
    const tone = lowpass.process(square, 1200 + (bright - 1200) * Math.exp(-t / .015), .7) * Math.min(1, t / .001) * Math.exp(-t / tau);
    snap.process(noise(mix), 3500, .7);
    const thump = body.next(mtof(midi - 24 - 12 * (1 - Math.exp(-t / .006)))) * Math.exp(-t / .025) * weight;
    out[i] = (tone + thump + snap.bp * Math.exp(-t / .0006) * .25) * Math.min(1, (out.length - i) / 192) * velocity * humane * .32;
  }
  mix.emit(time + jitter, route, out); mix.count('blip');
}

/** Pitch flick: the glide is done in 40 ms and the flick in 90 ms, low-passed at 3 kHz. Sub zaps (both ends at or under B3) keep their length. */
export function zap(mix: Mix, time: number, fromMidi: number, toMidi: number, duration: number, velocity: number, route: Route) {
  // A retime can collapse the cue span; progress divides by it.
  if (!(duration > 0)) return;
  const low = Math.max(fromMidi, toMidi) <= 59, length = low ? duration : Math.min(duration, .09), bend = low ? duration : Math.min(duration, .04);
  const out = buffer(length), osc = new Sine(), soften = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = Math.min(1, t / bend);
    const value = osc.next(mtof(fromMidi + (toMidi - fromMidi) * (1 - Math.exp(-progress * 4)) / (1 - Math.exp(-4))));
    out[i] = (low ? Math.tanh(value * 1.8) * (1 - t / length * .6) : soften.process(value, 3000, .6) * Math.exp(-t / .03) * 1.4) * gate(t, length) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('zap');
}

/** Crisp closed hat: high-passed noise, very short. */
export function hat(mix: Mix, time: number, velocity: number, route: Route, decay = .018) {
  const out = buffer(decay * 5), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    filter.process(noise(mix), 9000, .9);
    out[i] = filter.hp * pluckEnv(t, .0004, decay) * velocity * .6;
  }
  mix.emit(time, route, out); mix.count('hat');
}

/** Tight trap clap: three bursts and a short, bright tail. */
export function clap(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.22), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const bursts = [0, .007, .014].reduce((sum, offset) => sum + (t >= offset ? Math.exp(-(t - offset) / .003) : 0), 0);
    filter.process(noise(mix), 1800, .9);
    out[i] = filter.bp * (bursts * .7 + Math.exp(-t / .05) * .5) * velocity * .95;
  }
  mix.emit(time, route, out); mix.count('clap');
}

/** Switch click: a 1 ms noise edge band-passed at 3.5 kHz over a small low-passed knock, never full-band. */
export function click(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.012), edge = new Svf(), knock = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, n = noise(mix);
    edge.process(n, 3500, .7); knock.process(n, 900, .8);
    out[i] = (edge.bp * Math.exp(-t / .0008) * 1.4 + knock.lp * Math.exp(-t / .003) * .8) * gate(t, .012) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('click');
}

/**
 * Build into a hit: noise under a low-pass opening 300 Hz → 4 kHz over an 808 glide an octave under, cut dead at
 * `end` so the hit lands on silence. `roll` adds a hat roll accelerating from `every` to a quarter of it.
 */
export function riser(mix: Mix, start: number, end: number, fromMidi: number, toMidi: number, level: number, route: Route, roll?: {every: number; route: Route; level?: number}) {
  if (!(end > start)) return;
  const duration = end - start, out = buffer(duration), filter = new Svf(), sub = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = t / duration;
    filter.process(noise(mix), 300 + 3700 * progress ** 2, .6);
    const glide = Math.tanh(sub.next(mtof(fromMidi - 12 + (toMidi - fromMidi) * progress)) * 1.6) * .35 * progress;
    out[i] = (filter.lp * progress ** 1.6 + glide) * gate(t, duration) * level;
  }
  mix.emit(start, route, out); mix.count('riser');
  if (roll) for (let t = start + duration * .4; t < end - .02;) {
    const progress = (t - start) / duration;
    hat(mix, t, (roll.level ?? .35) * (.4 + .6 * progress), roll.route);
    t += roll.every * 4 ** -((progress - .4) / .6);
  }
}

const shapeAt = (progress: number, peak: number) => {
  // Bell-shaped speed of an eased move whose fastest point is at `peak`: the sweep is loudest where the picture moves most.
  const warped = progress < peak ? .5 * progress / peak : .5 + .5 * (progress - peak) / (1 - peak);
  return Math.sin(Math.PI * clamp(warped)) ** 2;
};

/** Pink noise (Kellet's economy filter) for the moves: no sample hold, so nothing whistles. */
const pink = () => {
  let b0 = 0, b1 = 0, b2 = 0;
  return (white: number) => {
    b0 = .99765 * b0 + white * .099; b1 = .963 * b1 + white * .2965; b2 = .57 * b2 + white * 1.0526;
    return (b0 + b1 + b2 + white * .1848) * .25;
  };
};

/**
 * Camera move ("push"): pink air under a 2-pole low-pass whose cutoff (250 Hz → 1.8 kHz, 2.5 kHz for the
 * biggest) and level (∝ speed²) follow the move, a low-passed grab on the first frame, and a landing on the settle
 * frame: a 55 → 45 Hz thump with a soft transient, so the move is felt where it starts and where it stops.
 * `split` keeps the air under 900 Hz for the voice.
 */
export function sweep(mix: Mix, start: number, duration: number, level: number, route: Route, options: {from?: number; to?: number; peak?: number; panFrom?: number; panTo?: number; split?: boolean; sub?: [number, number]; grab?: number; land?: number} = {}) {
  if (!(duration > 0)) return;
  const grab = options.grab ?? .5, land = options.land ?? .5, tail = .2, peak = options.peak ?? .5;
  const from = Math.min(options.from ?? 250, 600), to = Math.min(options.split ? 900 : (options.to ?? 3500) > 4000 ? 2500 : 1800, options.to ?? 3500);
  const left = buffer(duration + tail), right = buffer(duration + tail), air = new Svf(), edge = new Svf(), tone = new Sine(), thump = new Sine(), colour = pink();
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, progress = Math.min(1, t / duration), speed = t < duration ? shapeAt(progress, peak) : 0, n = noise(mix);
    air.process(colour(n), from + (to - from) * speed, .5);
    edge.process(n, 4000, .6);
    let value = air.lp * speed ** 2 * 2 * gate(t, duration);
    if (options.sub && t < duration) value += Math.tanh(tone.next(mtof(options.sub[0] + (options.sub[1] - options.sub[0]) * progress)) * 1.5) * .3 * gate(t, duration);
    value += edge.lp * Math.exp(-t / .004) * grab * 1.6;
    const landed = t - duration;
    if (landed >= 0) value += (thump.next(55 - 10 * (1 - Math.exp(-landed / .06))) * Math.exp(-landed / .06) * 1.3 + edge.lp * Math.exp(-landed / .003) * 1.2) * land * Math.min(1, landed / .001, (tail - landed) / .004);
    const [gl, gr] = panGains((options.panFrom ?? 0) + ((options.panTo ?? 0) - (options.panFrom ?? 0)) * progress);
    const g = value * level * .4;
    left[i] = g * gl * Math.SQRT2; right[i] = g * gr * Math.SQRT2;
  }
  mix.emit(start, route, left, right); mix.count('sweep');
}

/** The agent ball: a sine droplet bent up into its note, with a 3.5 kHz snap on the touch and a small sub thump. `fifth` is the blue (Signals) agent. */
export function droplet(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {fifth?: boolean; detune?: boolean; thump?: number} = {}) {
  const out = buffer(.09), a = new Sine(), b = new Sine(), c = new Sine(), low = new Sine(), snap = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, hz = mtof(midi - 5 * Math.exp(-t / .005));
    snap.process(noise(mix), 3500, .7);
    let value = a.next(hz);
    if (options.detune) value = value * .7 + b.next(hz * 2 ** (18 / 1200)) * .5;
    if (options.fifth) value += c.next(hz * 1.5) * .45;
    value += low.next(mtof(28 + 12 * Math.exp(-t / .01))) * (options.thump ?? 0) * Math.exp(-t / .025);
    out[i] = (value * Math.exp(-t / .03) + snap.bp * Math.exp(-t / .0006) * .3) * gate(t, .09) * velocity * .4;
  }
  mix.emit(time, route, out); mix.count('droplet');
}

/**
 * Warning: A5 under G♯6 twice, the ♯11 a major seventh over the fifth: tense without a semitone beating at ~50 Hz.
 * `resolve` lifts the G♯ to A; `soft` plays one sine tick at `midi`.
 */
export function warn(mix: Mix, time: number, velocity: number, route: Route, options: {resolve?: boolean; soft?: boolean; midi?: number} = {}) {
  const base = options.midi ?? 81;
  if (options.soft) { pure(mix, time, base, velocity, route, .02); return; }
  if (options.resolve) { blip(mix, time, base + 11, velocity, route, .045, {exact: true}); blip(mix, time + .075, base + 12, velocity * 1.1, route, .07, {exact: true}); return; }
  for (const offset of [0, .075]) for (const midi of [base, base + 11]) blip(mix, time + offset, midi, velocity * .75, route, .045, {exact: true});
}

/** A pure sine tick (no harmonics): the softened issue triangles and the heartbeat. */
export function pure(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .03) {
  const out = buffer(length), osc = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) out[i] = osc.next(hz) * gate(i / 48_000, length) * Math.exp(-i / 48_000 / length * 2) * velocity * .45;
  mix.emit(time, route, out); mix.count('pure');
}

/** Log and count-up data: a clack (noise at 2.2 kHz, 1 ms) on a 4 ms 1.1 kHz sine, `rise` semitones up. */
export function tick(mix: Mix, time: number, velocity: number, route: Route, rise = 0) {
  const out = buffer(.02), osc = new Sine(), clack = new Svf(), hz = 1100 * 2 ** (rise / 12), jitter = (mix.random() - .5) * .004;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    clack.process(noise(mix), 2200, 1);
    out[i] = (clack.bp * Math.exp(-t / .001) * 1.5 + osc.next(hz) * Math.exp(-t / .004) * .5) * gate(t, .02) * velocity * .3;
  }
  mix.emit(time + jitter, route, out); mix.count('tick');
}

/** Clouds and smoke: crushed noise under a moving low-pass; `shape(progress)` gives [cutoff Hz, level]. */
export function haze(mix: Mix, start: number, end: number, route: Route, shape: (progress: number) => [number, number], crush = 6000) {
  if (!(end > start)) return;
  const duration = end - start, out = buffer(duration), filter = new Svf(), rumble = new Svf(), hold = Math.max(1, Math.round(48_000 / crush));
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, [cutoff, level] = shape(t / duration);
    if (i % hold === 0) held = noise(mix);
    rumble.process(filter.process(held, cutoff, .8), 60, .7);
    out[i] = rumble.hp * level * gate(t, duration) * .8;
  }
  mix.emit(start, route, out); mix.count('haze');
}

/**
 * The budget meter as a train of taps: `rate(progress)` taps a second at `pitch(progress)`, each closing from
 * `bright(progress)`. Filling speeds up and rises; draining slows, falls and darkens.
 */
export function meter(mix: Mix, start: number, end: number, velocity: number, route: Route, pitch: (progress: number) => number, rate: (progress: number) => number, bright: (progress: number) => number = () => 6000) {
  for (let t = start; t < end - .01;) {
    const progress = (t - start) / (end - start);
    blip(mix, t, pitch(progress), velocity, route, .025, {bright: bright(progress), body: .3});
    t += 1 / rate(progress);
  }
}
