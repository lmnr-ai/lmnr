import {OnePole, Sine, Svf, gateEnv, mtof, pluckEnv, samples, type Rng} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * The OpenAI "Get ready" palette, all synthesized: a sine sub that swells in and is gated off into silence, soft
 * pentatonic keys, glassy high partials, dry crisp ticks, an air floor and a thin whistle. No samples, no piano.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (random: Rng) => random() * 2 - 1;
/** Paul Kellet's economy pink filter, as in voices.ts: air, not hiss. */
class Pink {
  private b0 = 0; private b1 = 0; private b2 = 0;
  next(random: Rng) {
    const white = noise(random);
    this.b0 = .99765 * this.b0 + white * .099046; this.b1 = .963 * this.b1 + white * .2965164; this.b2 = .57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * .1848) * .25;
  }
}

/**
 * The pressure sub: a sine that swells in over `attack` (the reference's ~40 ms), holds flat with a faint dotted-eighth
 * bump, sags `drift` semitones across the hold and is gated off over `release` — the silence after it is the rhythm.
 * `drive` adds the 2nd/3rd harmonics that let a 35–60 Hz note read on small speakers.
 */
export function pressure(mix: Mix, time: number, midi: number, hold: number, velocity: number, route: Route, options: {
  attack?: number; release?: number; drift?: number; drive?: number; bump?: number; octave?: number;
} = {}) {
  if (hold <= 0 || velocity <= 0) return;
  const attack = options.attack ?? .04, release = options.release ?? .22, drift = options.drift ?? -1, drive = options.drive ?? 1.7, bump = options.bump ?? .1, octave = options.octave ?? .5;
  const out = buffer(attack + hold + release + .01), osc = new Sine(), smooth = OnePole.lowpass(520), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const bend = 2 ** ((1.5 * Math.exp(-t / .025) + drift * (1 - Math.exp(-t / (hold * .7 + .05)))) / 12);
    const pulse = 1 + bump * Math.max(0, Math.cos(2 * Math.PI * t / .375)) ** 6;
    const phase = osc.next(hz * bend), body = Math.tanh(phase * drive) / Math.tanh(drive);
    // An octave partial (2·sin² − 1 tracks the bent fundamental exactly) puts the pressure into the 90–400 Hz band.
    out[i] = smooth.process(body + octave * (2 * phase * phase - 1)) * gateEnv(t, attack, hold, release) * pulse * velocity * .45;
  }
  mix.emit(time, route, out); mix.count('pressure');
}

/** A soft key: a sine with quickly fading 2nd/3rd partials, a 4 ms attack and a short decay. Never hammered. */
export function key(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number; attack?: number} = {}) {
  const decay = options.decay ?? .2, attack = options.attack ?? .004;
  const out = buffer(attack + decay * 5 + .02), a = new Sine(), b = new Sine(), c = new Sine(), soften = OnePole.lowpass(2600), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const value = a.next(hz) + .32 * b.next(hz * 2) * Math.exp(-t / (decay * .45)) + .1 * c.next(hz * 3.01) * Math.exp(-t / (decay * .2));
    out[i] = soften.process(value) * pluckEnv(t, attack, decay) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('key');
}

/** A glassy high partial with a faint inharmonic shimmer; `attack` > 0 swells it in for blooms. */
export function glint(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number; attack?: number} = {}) {
  const decay = options.decay ?? .32, attack = options.attack ?? .0015;
  const out = buffer(attack + decay * 5 + .02), a = new Sine(), b = new Sine(), c = new Sine(), d = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const value = a.next(hz) + .5 * b.next(hz * 1.0035) + .16 * c.next(hz * 2.76) * Math.exp(-t / (decay * .25)) + .12 * d.next(hz * 5.4) * Math.exp(-t / (decay * .1));
    out[i] = value * pluckEnv(t, attack, decay) * velocity * .26;
  }
  mix.emit(time, route, out); mix.count('glint');
}

/** A dry, crisp tick: a 1 ms high-passed noise snap over a tiny tuned ping. */
export function tick(mix: Mix, time: number, velocity: number, route: Route, options: {tone?: number; decay?: number} = {}) {
  const tone = options.tone ?? 2600, decay = options.decay ?? .006;
  const out = buffer(.04), ping = new Sine(), snap = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    snap.process(noise(mix.random), 3400, .8);
    out[i] = (snap.hp * Math.exp(-t / .0011) + .45 * ping.next(tone) * pluckEnv(t, .0004, decay)) * velocity * .55;
  }
  mix.emit(time, route, out); mix.count('tick');
}

/** The air floor: two independent pink-noise ears band-passed around 7 kHz, shaped by `level(time)`. */
export function air(mix: Mix, start: number, end: number, level: (time: number) => number, route: Route) {
  if (end <= start) return;
  const left = buffer(end - start), right = buffer(end - start);
  const ears = [0, 1].map(() => ({pink: new Pink(), band: new Svf()}));
  for (let i = 0; i < left.length; i++) {
    const t = start + i / 48_000, gain = level(t) * Math.min(1, i / 4800, (left.length - i) / 4800);
    const [l, r] = ears.map(ear => { ear.band.process(ear.pink.next(mix.random), 7000, .5); return ear.band.bp; });
    left[i] = l * gain * 1.25; right[i] = r * gain * 1.25;
  }
  mix.emit(start, route, left, right); mix.count('air');
}

/**
 * A thin whistle rising from `fromMidi` to `toMidi` with a crescendo, over a quiet low-Q pink swell capped under
 * 3 kHz. Used only before the drops, like the reference's 4.8 kHz line into its last hit.
 */
export function whistle(mix: Mix, start: number, end: number, route: Route, options: {fromMidi: number; toMidi: number; level: number; breath?: number}) {
  const duration = end - start;
  if (duration <= 0) return;
  const out = buffer(duration), osc = new Sine(), pink = new Pink(), band = new Svf(), breath = options.breath ?? .6;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = t / duration;
    const hz = mtof(options.fromMidi + (options.toMidi - options.fromMidi) * progress ** 1.4) * (1 + .002 * Math.sin(2 * Math.PI * 5.2 * t));
    band.process(pink.next(mix.random), 600 + 2200 * progress, .5);
    const envelope = progress ** 2.2 * Math.min(1, (out.length - i) / 480);
    out[i] = (osc.next(hz) * .5 + band.bp * breath) * envelope * options.level;
  }
  mix.emit(start, route, out); mix.count('whistle');
}
