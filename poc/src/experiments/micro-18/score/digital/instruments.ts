import {OnePole, Saw, Sine, Svf, clamp, mtof, pluckEnv} from '../dsp';
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
 */
export function block(mix: Mix, start: number, end: number, tones: readonly number[], route: Route, options: {cutoff?: [number, number]; level?: number; root?: number; crush?: number; q?: number} = {}) {
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
    out[i] = held * gate(t, duration) * level;
  }
  mix.emit(start, route, out); mix.count('block');
}

/** Square data blip: odd harmonics under 9 kHz, switched on and off. */
export function blip(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .035) {
  const out = buffer(length), hz = mtof(midi), harmonics = [1, 3, 5, 7, 9].filter(k => k * hz < 9000), oscillators = harmonics.map(() => new Sine());
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    let value = 0;
    harmonics.forEach((k, index) => { value += oscillators[index].next(hz * k) / k; });
    out[i] = value * gate(t, length) * velocity * .32;
  }
  mix.emit(time, route, out); mix.count('blip');
}

/** Exponential pitch sweep between two notes on a triangle-ish sine: failures fall, sends rise. */
export function zap(mix: Mix, time: number, fromMidi: number, toMidi: number, duration: number, velocity: number, route: Route) {
  // A retime can collapse the cue span; progress divides by it.
  if (!(duration > 0)) return;
  const out = buffer(duration), osc = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = t / duration;
    const value = osc.next(mtof(fromMidi + (toMidi - fromMidi) * (1 - Math.exp(-progress * 4)) / (1 - Math.exp(-4))));
    out[i] = Math.tanh(value * 1.8) * gate(t, duration) * (1 - progress * .6) * velocity * .3;
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

/** Broadband digital click: one sample-edge of noise, for glitches and switches. */
export function click(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.006);
  for (let i = 0; i < out.length; i++) out[i] = noise(mix) * Math.exp(-i / 48) * velocity * .5;
  mix.emit(time, route, out); mix.count('click');
}

/** Rising filtered-noise sweep with a tone underneath, cut dead at `end` (never faded) so the next hit lands on silence. */
export function riser(mix: Mix, start: number, end: number, fromMidi: number, toMidi: number, level: number, route: Route) {
  if (!(end > start)) return;
  const duration = end - start, out = buffer(duration), filter = new Svf(), tone = new Saw(mix.random()), soften = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = t / duration, hz = mtof(fromMidi + (toMidi - fromMidi) * progress);
    filter.process(noise(mix), 400 + 5600 * progress ** 2, 2.2);
    out[i] = (filter.bp * .9 + soften.process(tone.next(hz), hz * 2, .7) * .25) * progress ** 1.6 * gate(t, duration) * level;
  }
  mix.emit(start, route, out); mix.count('riser');
}
