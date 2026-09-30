import {OnePole, Saw, Sine, Svf, clamp, mtof, panGains, pluckEnv} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * The digital reference's palette (LAM-2315): a driven 808 sub that carries most of the energy, hard-gated
 * saw chord blocks that start and stop on a sample, square "data" blips, pitch-drop zaps and crisp hats.
 * Everything is near mono and nothing fades: sound is switched on and off, and silence is the punctuation.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, Math.round(duration * 48_000)));
const noise = (mix: Mix) => mix.random() * 2 - 1;
/** Soft clip with a bias, so it adds even harmonics too; callers high-pass the DC away. */
const sat = (x: number, drive: number, bias = 0) => (Math.tanh((x + bias) * drive) - Math.tanh(bias * drive)) / Math.tanh(drive);
/** Hard gate: a 2 ms on, a 4 ms off. Long enough not to click, short enough to read as a switch. */
const gate = (t: number, length: number) => t < 0 || t > length ? 0 : Math.min(1, t / .002, (length - t) / .004);

/**
 * 808: a sine that drops from `drop` semitones above its note in ~60 ms, through a biased saturator, so hits read as a
 * "zap" into the sub and the 2nd and 3rd harmonics carry it on speakers that can't play D1.
 */
export function sub808(mix: Mix, time: number, midi: number, duration: number, velocity: number, route: Route, options: {drop?: number; fall?: number; drive?: number; decay?: number} = {}) {
  const drop = options.drop ?? 24, fall = options.fall ?? .045, drive = options.drive ?? 2.4, decay = options.decay ?? 9;
  const out = buffer(duration), osc = new Sine(), dc = new Svf(), click = OnePole.lowpass(2400), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    dc.process(sat(osc.next(hz * 2 ** (drop * Math.exp(-t / fall) / 12)), drive, .25), 20, .7);
    const snap = click.process(noise(mix)) * Math.exp(-t / .0015);
    out[i] = (dc.hp * Math.exp(-t / decay) + snap * .6) * gate(t, duration) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('sub808');
}

/**
 * A gated chord block: three drifting saws per tone (-11, 0, +10 cents) under a low-pass that bites open by ~1.3
 * octaves on the gate and settles, then a soft drive for the edge above the cutoff; plus a saw an octave under the
 * root for the reference's buzzing low stack. `pulse` gates it into 60%-duty steps of that length (from `start`), so
 * a chord under the voice moves instead of droning. `width` spreads the three saws of each tone to ±width.
 */
export function block(mix: Mix, start: number, end: number, tones: readonly number[], route: Route, options: {cutoff?: [number, number]; level?: number; root?: number; drive?: number; q?: number; swell?: boolean; pulse?: number; width?: number} = {}) {
  const duration = Math.max(.02, end - start), [from, to] = options.cutoff ?? [900, 1500], level = (options.level ?? 1) * .2 / Math.sqrt(tones.length + 1);
  const width = options.width ?? 0, drive = options.drive ?? 2.4, pan = route.pan ?? 0;
  const left = buffer(duration), right = width ? buffer(duration) : left, filters = [new Svf(), new Svf()], low = new Svf();
  const spread = [-11, 0, 10].map((cents, k) => ({cents, gains: panGains(clamp(pan + (k - 1) * width, -1, 1))}));
  const oscillators = tones.flatMap(midi => spread.map(voice => ({
    saw: new Saw(mix.random()), hz: mtof(midi + voice.cents / 100), gains: voice.gains,
    rate: 2 * Math.PI * (.15 + .3 * mix.random()), phase: 2 * Math.PI * mix.random(),
  })));
  const root = options.root === undefined ? undefined : {saw: new Saw(mix.random()), hz: mtof(options.root)}, centre = panGains(pan);
  // Unity gain for small signals, so `drive` changes the edge, not the level.
  const driven = (x: number) => sat(x * .5, drive) * Math.tanh(drive) / (.5 * drive);
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000;
    let l = 0, r = 0;
    for (const oscillator of oscillators) {
      const value = oscillator.saw.next(oscillator.hz * (1 + .0015 * Math.sin(oscillator.rate * t + oscillator.phase)));
      if (width) { l += value * oscillator.gains[0]; r += value * oscillator.gains[1]; } else l += value;
    }
    // Three saws per tone at the old two-saw loudness.
    l *= .8165; r *= .8165;
    // The bite: the cutoff jumps open on the gate and settles in 25 ms, the "chk" of a switched block.
    const cutoff = (from + (to - from) * clamp(t / duration)) * (1 + 2.5 * Math.exp(-t / .025)), q = options.q ?? 1.4;
    const bass = root ? low.process(root.saw.next(root.hz), 260, .7) * 2.2 : 0;
    const step = options.pulse ? gate(t % options.pulse, options.pulse * .6) : 1;
    const g = gate(t, duration) * step * level * (options.swell ? (t / duration) ** 3 * 1.6 : 1);
    // `swell` is a reversed block: it blooms into its end and is cut there, the breath in before a hit.
    if (!width) { left[i] = (driven(filters[0].process(l, cutoff, q)) + bass) * g; continue; }
    left[i] = (driven(filters[0].process(l, cutoff, q)) + bass * centre[0]) * g;
    right[i] = (driven(filters[1].process(r, cutoff, q)) + bass * centre[1]) * g;
  }
  // A stereo block carries its own pan (emit ignores route.pan for stereo buffers).
  mix.emit(start, route, left, right); mix.count('block');
}

/**
 * Data tap: a sub-millisecond 6 kHz click, then a 2-operator FM tone that chirps down 7 semitones into its note in
 * ~3 ms while its index and a key-tracked low-pass close (the spectrum falls ~1.5 octaves across the hit), two short
 * upper partials, a biased saturator, and a small body two octaves under. `length` is the tone's decay. Hero hits
 * pass `exact`; the rest vary level (±1.5 dB), time (±3 ms), FM index (±15 %) and chirp (±1 st).
 */
export function blip(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .035, options: {bright?: number; exact?: boolean; body?: number} = {}) {
  const exact = options.exact, jitter = exact ? 0 : (mix.random() - .5) * .006, humane = exact ? 1 : 10 ** ((mix.random() - .5) * 3 / 20);
  const tau = Math.max(.012, length), out = buffer(Math.min(.5, tau * 5 + .01)), hz = mtof(midi);
  const bright = (options.bright ?? 7000) / 7000, weight = (options.body ?? .5) * .5;
  const index = 1.6 * bright * (exact ? 1 : .85 + .3 * mix.random()), chirp = 7 + (exact ? 0 : mix.random() * 2 - 1);
  const carrier = new Sine(), modulator = new Sine(), second = new Sine(), fourth = new Sine(), body = new Sine();
  const lowpass = new Svf(), snap = new Svf(), dc = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, f = hz * 2 ** (chirp * Math.exp(-t / .0025) / 12);
    let tone = carrier.next(f + modulator.next(f * 2) * f * (index * Math.exp(-t / .009) + .8));
    tone += .35 * second.next(f * 2.001) * Math.exp(-t / .006) + .18 * fourth.next(f * 4.2) * Math.exp(-t / .012);
    tone = lowpass.process(tone, Math.min(16_000, f * 3.5 + 10_000 * bright * Math.exp(-t / .006)), .8);
    let value = sat(tone * Math.min(1, t / .0004) * Math.exp(-t / tau), 1.6, .15);
    value += body.next(mtof(midi - 24 - 12 * (1 - Math.exp(-t / .004)))) * Math.exp(-t / .008) * weight;
    dc.process(value, 40, .7); value = dc.hp;
    snap.process(noise(mix), 6000, .9);
    out[i] = (value + snap.hp * Math.exp(-t / .00035) * .55) * Math.min(1, (out.length - i) / 192) * velocity * humane * .3;
  }
  mix.emit(time + jitter, route, out); mix.count('blip');
}

/**
 * Pitch flick: an FM tone (1:1, index 1.5 → 0.3) whose glide is done in 40 ms and the flick in 90 ms, under a
 * low-pass that tracks three times its pitch, lightly saturated. Sub zaps (both ends at or under B3) keep their
 * length and stay a driven sine.
 */
export function zap(mix: Mix, time: number, fromMidi: number, toMidi: number, duration: number, velocity: number, route: Route) {
  // A retime can collapse the cue span; progress divides by it.
  if (!(duration > 0)) return;
  const low = Math.max(fromMidi, toMidi) <= 59, length = low ? duration : Math.min(duration, .09), bend = low ? duration : Math.min(duration, .04);
  const out = buffer(length), osc = new Sine(), modulator = new Sine(), soften = new Svf(), dc = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = Math.min(1, t / bend);
    const hz = mtof(fromMidi + (toMidi - fromMidi) * (1 - Math.exp(-progress * 4)) / (1 - Math.exp(-4)));
    if (low) { out[i] = Math.tanh(osc.next(hz) * 1.8) * (1 - t / length * .6) * gate(t, length) * velocity * .3; continue; }
    const value = osc.next(hz + modulator.next(hz) * hz * (.8 * Math.exp(-t / .025) + .15));
    dc.process(sat(soften.process(value, hz * 2, 1.5), 1.4, .1), 40, .7);
    out[i] = dc.hp * Math.exp(-t / .03) * 1.4 * gate(t, length) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('zap');
}

/**
 * 808 hat: six band-limited squares at the 808's inharmonic ratios plus noise, band-passed around 8.5 kHz and
 * high-passed at 6.5 kHz, with a 3 ms tick over a body whose decay varies ±20 % and grows with velocity.
 */
export function hat(mix: Mix, time: number, velocity: number, route: Route, decay = .018) {
  const out = buffer(decay * 6 + .01), band = new Svf(), high = new Svf(), air = new Svf();
  const squares = [205.3, 304.4, 369.6, 522.7, 540, 800].map(hz => { const phase = mix.random(); return {hz: hz * 1.6, a: new Saw(phase), b: new Saw((phase + .5) % 1)}; });
  const body = decay * (.8 + .4 * mix.random()) * (.7 + .6 * velocity), centre = 8500 * (.9 + .2 * mix.random());
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    let metal = 0;
    for (const square of squares) metal += (square.a.next(square.hz) - square.b.next(square.hz)) * .5;
    band.process(metal / 6 * .6 + noise(mix) * .5, centre, 1.2);
    high.process(band.bp, 6500, .7);
    air.process(high.hp, 12_000, .6);
    out[i] = air.lp * Math.min(1, t / .0003) * (Math.exp(-t / .003) * .5 + Math.exp(-t / body) * .6) * velocity * 1.1;
  }
  mix.emit(time, route, out); mix.count('hat');
}

/**
 * Trap clap: four bursts, each through its own band-pass between 1.1 and 1.6 kHz, a 5 kHz sizzle, and a 90 ms tail
 * of independent left and right noise so the clap has a body in the room instead of a mono point.
 */
export function clap(mix: Mix, time: number, velocity: number, route: Route) {
  const left = buffer(.22), right = buffer(.22), sizzle = new Svf(), tails = [new Svf(), new Svf()];
  const bursts = [0, .006, .013, .021].map(offset => ({offset, filter: new Svf(), centre: 1100 + 500 * mix.random()}));
  const [gl, gr] = panGains(route.pan ?? 0);
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, n = noise(mix);
    let dry = 0;
    for (const burst of bursts) {
      burst.filter.process(n, burst.centre, 1.1);
      if (t >= burst.offset) dry += burst.filter.bp * Math.exp(-(t - burst.offset) / .003);
    }
    sizzle.process(n, 5000, .7);
    dry = dry * .8 + sizzle.hp * Math.exp(-t / .03) * .3;
    tails[0].process(noise(mix), 1500, .9); tails[1].process(noise(mix), 1500, .9);
    const tail = Math.exp(-t / .09) * .45, g = velocity * .95 * Math.SQRT2;
    left[i] = (dry + tails[0].bp * tail) * gl * g; right[i] = (dry + tails[1].bp * tail) * gr * g;
  }
  mix.emit(time, route, left, right); mix.count('clap');
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

/** The agent ball: a sine droplet bent up 9 semitones into its note (a bubble's rise), with a faster octave partial, a 3.5 kHz snap on the touch and a small sub thump. `fifth` is the blue (Signals) agent. */
export function droplet(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {fifth?: boolean; detune?: boolean; thump?: number} = {}) {
  const out = buffer(.09), a = new Sine(), second = new Sine(), b = new Sine(), c = new Sine(), low = new Sine(), snap = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, hz = mtof(midi - 9 * Math.exp(-t / .008));
    snap.process(noise(mix), 3500, .7);
    let value = a.next(hz) + second.next(hz * 2) * .18 * Math.exp(-t / .015);
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

/**
 * A near-pure bell tick: the note plus two quicker inharmonic partials (2.76 and 5.4), a 3-semitone drop into pitch
 * in ~2 ms, a 1 ms 6 kHz tick, and a raised-cosine attack. The softened issue triangles, the heartbeat, the latch.
 */
export function pure(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .03) {
  const out = buffer(length), osc = new Sine(), upper = new Sine(), top = new Sine(), edge = new Svf(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, f = hz * 2 ** (3 * Math.exp(-t / .002) / 12);
    const tone = osc.next(f) + .25 * upper.next(f * 2.76) * Math.exp(-t / (length / 3)) + .18 * top.next(f * 5.4) * Math.exp(-t / (length / 4));
    edge.process(noise(mix), 6000, 1);
    const attack = t < .0005 ? .5 - .5 * Math.cos(Math.PI * t / .0005) : 1;
    out[i] = (tone * attack * Math.exp(-t / length * 2) + edge.bp * Math.exp(-t / .001) * .15) * gate(t, length) * velocity * .45;
  }
  mix.emit(time, route, out); mix.count('pure');
}

/** Log and count-up data: a 2.2 kHz clack that also strikes two resonators at 1.1 kHz·2^(rise/12) and 2.3× that. */
export function tick(mix: Mix, time: number, velocity: number, route: Route, rise = 0) {
  const out = buffer(.02), clack = new Svf(), mode = new Svf(), overtone = new Svf(), third = new Svf(), hz = 1100 * 2 ** (rise / 12), jitter = (mix.random() - .5) * .004;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, strike = noise(mix) * Math.exp(-t / .001);
    clack.process(strike, 2200, 1); mode.process(strike, hz, 40); overtone.process(strike, hz * 2.3, 60); third.process(strike, hz * 4.1, 80);
    out[i] = (clack.bp * 1.5 + (mode.bp * .3 + overtone.bp * .07 + third.bp * .03) * 2.5) * gate(t, .02) * velocity * .3;
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
