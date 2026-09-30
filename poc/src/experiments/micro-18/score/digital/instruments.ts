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
 */
export function block(mix: Mix, start: number, end: number, tones: readonly number[], route: Route, options: {cutoff?: [number, number]; level?: number; root?: number; crush?: number; q?: number; swell?: boolean} = {}) {
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
    out[i] = held * gate(t, duration) * level * (options.swell ? (t / duration) ** 3 * 1.6 : 1);
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

const shapeAt = (progress: number, peak: number) => {
  // Bell-shaped speed of an eased move whose fastest point is at `peak`: the sweep is loudest where the picture moves most.
  const warped = progress < peak ? .5 * progress / peak : .5 + .5 * (progress - peak) / (1 - peak);
  return Math.sin(Math.PI * clamp(warped)) ** 2;
};

/**
 * Camera move: sample-held noise through a band-pass whose centre and level follow the move's speed, hard-gated on
 * the settle frame. `split` keeps only a low body and 5 kHz air, clearing the 1–4 kHz band for the voice.
 */
export function sweep(mix: Mix, start: number, duration: number, level: number, route: Route, options: {from?: number; to?: number; peak?: number; panFrom?: number; panTo?: number; split?: boolean; sub?: [number, number]; grab?: number} = {}) {
  if (!(duration > 0)) return;
  // The grab: a short, dark transient on the frame the move starts, so the ear catches the move before it swells.
  const grab = options.grab ?? .5, grabFilter = new Svf();
  const from = options.from ?? 300, to = options.to ?? 3500, peak = options.peak ?? .5;
  const left = buffer(duration), right = buffer(duration), band = new Svf(), body = new Svf(), air = new Svf(), tone = new Sine();
  let held = 0, phase = 0;
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, progress = t / duration, speed = shapeAt(progress, peak);
    // Digital grain: the noise is held at 12 kHz, coarsening to 6 kHz at the fastest point.
    phase += (12_000 - 6000 * speed) / 48_000;
    if (phase >= 1) { phase -= 1; held = noise(mix); }
    band.process(held, from + (to - from) * speed, 1.2);
    air.process(held, 5000, .7);
    let value = options.split ? body.process(held, 180, .8) * .9 + air.hp * 1.4 : band.bp;
    if (options.sub) value += Math.tanh(tone.next(mtof(options.sub[0] + (options.sub[1] - options.sub[0]) * progress)) * 1.5) * .3;
    const [gl, gr] = panGains((options.panFrom ?? 0) + ((options.panTo ?? 0) - (options.panFrom ?? 0)) * progress);
    const grabbed = grabFilter.process(noise(mix), 900, 1.4) * Math.exp(-t / .012) * grab * 1.2;
    const g = (value * speed ** 1.5 + grabbed) * gate(t, duration) * level * .4;
    left[i] = g * gl * Math.SQRT2; right[i] = g * gr * Math.SQRT2;
  }
  mix.emit(start, route, left, right); mix.count('sweep');
}

/** The agent ball: a sine droplet bent up into its note, with a small sub thump. `fifth` is the blue (Signals) agent. */
export function droplet(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {fifth?: boolean; detune?: boolean; thump?: number} = {}) {
  const out = buffer(.09), a = new Sine(), b = new Sine(), c = new Sine(), low = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, hz = mtof(midi - 5 * Math.exp(-t / .005));
    let value = a.next(hz);
    if (options.detune) value = value * .7 + b.next(hz * 2 ** (18 / 1200)) * .5;
    if (options.fifth) value += c.next(hz * 1.5) * .45;
    value += low.next(mtof(26 + 12 * Math.exp(-t / .01))) * (options.thump ?? 0) * Math.exp(-t / .025);
    out[i] = value * Math.exp(-t / .03) * gate(t, .09) * velocity * .4;
  }
  mix.emit(time, route, out); mix.count('droplet');
}

/** Warning: a square semitone dyad (G♯5 + A5) twice, the ♯11 rubbing on the fifth. `resolve` slides the G♯ up to A. */
export function warn(mix: Mix, time: number, velocity: number, route: Route, options: {resolve?: boolean; soft?: boolean; midi?: number} = {}) {
  const base = options.midi ?? 80;
  if (options.soft) { [base, base + 1].forEach(midi => pure(mix, time, midi, velocity * .8, route, .02)); return; }
  if (options.resolve) { blip(mix, time, base, velocity, route, .045); blip(mix, time + .075, base + 1, velocity * 1.1, route, .07); return; }
  for (const offset of [0, .075]) for (const midi of [base, base + 1]) blip(mix, time + offset, midi, velocity * .75, route, .045);
}

/** A pure sine tick (no harmonics): the softened issue triangles and the heartbeat. */
export function pure(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .03) {
  const out = buffer(length), osc = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) out[i] = osc.next(hz) * gate(i / 48_000, length) * Math.exp(-i / 48_000 / length * 2) * velocity * .45;
  mix.emit(time, route, out); mix.count('pure');
}

/** A held sine gliding from one note to another (ease-out), rising in over its first fifth and cut at the end: a cluster voice converging. */
export function glide(mix: Mix, start: number, end: number, fromMidi: number, toMidi: number, velocity: number, route: Route) {
  if (!(end > start)) return;
  const duration = end - start, out = buffer(duration), osc = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = t / duration;
    out[i] = osc.next(mtof(fromMidi + (toMidi - fromMidi) * (1 - (1 - progress) ** 2))) * Math.min(1, progress * 5) * gate(t, duration) * velocity * .45;
  }
  mix.emit(start, route, out); mix.count('glide');
}

/** Log and count-up data: a 5.2 kHz sine tick, 4 ms. */
export function tick(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.005), osc = new Sine();
  for (let i = 0; i < out.length; i++) out[i] = osc.next(5200) * gate(i / 48_000, .005) * velocity * .35;
  mix.emit(time, route, out); mix.count('tick');
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

/** A held square whose pitch follows `pitch(progress)` and is crushed by `crush(progress)`: the budget meter. */
export function meter(mix: Mix, start: number, end: number, velocity: number, route: Route, pitch: (progress: number) => number, crush: (progress: number) => number = () => 48_000) {
  if (!(end > start)) return;
  const duration = end - start, out = buffer(duration), phases = [0, 0, 0];
  let held = 0, counter = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = t / duration, hz = mtof(pitch(progress));
    let value = 0;
    [1, 3, 5].forEach((k, index) => { phases[index] = (phases[index] + hz * k / 48_000) % 1; value += Math.sin(2 * Math.PI * phases[index]) / k; });
    counter += crush(progress) / 48_000;
    if (counter >= 1) { counter -= 1; held = value; }
    out[i] = held * gate(t, duration) * velocity * .22;
  }
  mix.emit(start, route, out); mix.count('meter');
}
