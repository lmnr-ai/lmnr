import {OnePole, Saw, Sine, Svf, clamp, gateEnv, mtof, panGains, samples, SR} from '../dsp';
import type {Mix, Pump, Route} from '../voices';

/*
 * Overdrive's arsenal: festival supersaws, trailer braams and taiko, stabs, a screaming lead,
 * alarms and laser zaps. All synthesized; the strings come from the VSCO banks via `bowed()`.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (mix: Mix) => mix.random() * 2 - 1;
const pumpGain = (pump: Pump | undefined, time: number) => {
  if (!pump || time < pump.origin) return 1;
  const phase = ((time - pump.origin) % pump.period) / pump.period;
  return 1 - pump.depth * (1 - clamp(phase / .6)) ** 2;
};

const SPREAD = [-24, -15, -7, 0, 7, 15, 24];

/**
 * Supersaw chord: seven detuned saws per note, spread across the stereo field, through a low-pass
 * that sweeps from `cutoff[0]` to `cutoff[1]` across the note. `pump` ducks it on every kick.
 */
export function supersaw(mix: Mix, start: number, end: number, notes: readonly number[], route: Route, options: {
  level?: number; cutoff?: [number, number]; attack?: number; release?: number; pump?: Pump; curve?: number;
} = {}) {
  const length = end - start; if (length <= 0) return;
  const attack = options.attack ?? .01, release = options.release ?? .25, [from, to] = options.cutoff ?? [3000, 3000];
  const left = buffer(length + release), right = buffer(length + release);
  notes.forEach((midi, noteIndex) => {
    const voices = SPREAD.map((cents, i) => ({saw: new Saw(mix.random()), hz: mtof(midi + cents / 100), gains: panGains((i / (SPREAD.length - 1) - .5) * 1.6 + (noteIndex % 2 ? .1 : -.1))}));
    const fl = new Svf(), fr = new Svf();
    for (let i = 0; i < left.length; i++) {
      const t = i / SR, env = gateEnv(t, attack, Math.max(0, length - attack), release);
      if (env === 0 && t > attack) continue;
      const cutoff = from * (to / from) ** (clamp(t / length) ** (options.curve ?? 1));
      let l = 0, r = 0;
      for (const voice of voices) { const value = voice.saw.next(voice.hz); l += value * voice.gains[0]; r += value * voice.gains[1]; }
      left[i] += fl.process(l, cutoff, .9) * env; right[i] += fr.process(r, cutoff, .9) * env;
    }
  });
  const level = (options.level ?? 1) * .05 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { const g = level * pumpGain(options.pump, start + i / SR); left[i] *= g; right[i] *= g; }
  mix.emit(start, route, left, right); mix.count('supersaw');
}

/** Short supersaw stab with a snapping filter envelope: the drop chords and the hype hits. */
export function stab(mix: Mix, time: number, notes: readonly number[], duration: number, velocity: number, route: Route) {
  const left = buffer(duration + .2), right = buffer(duration + .2);
  notes.forEach((midi, noteIndex) => {
    const voices = SPREAD.map((cents, i) => ({saw: new Saw(mix.random()), hz: mtof(midi + cents / 100), gains: panGains((i / 6 - .5) * 1.4 + (noteIndex % 2 ? .1 : -.1))}));
    const fl = new Svf(), fr = new Svf();
    for (let i = 0; i < left.length; i++) {
      const t = i / SR, env = gateEnv(t, .002, duration, .15), cutoff = 700 + 7000 * Math.exp(-t / .09);
      let l = 0, r = 0;
      for (const voice of voices) { const value = voice.saw.next(voice.hz); l += value * voice.gains[0]; r += value * voice.gains[1]; }
      left[i] += fl.process(l, cutoff, 1.1) * env; right[i] += fr.process(r, cutoff, 1.1) * env;
    }
  });
  const g = velocity * .09 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { left[i] *= g; right[i] *= g; }
  mix.emit(time, route, left, right); mix.count('stab');
}

/**
 * Trailer braam: a stack of low detuned saws over a sine sub an octave down, driven hard, with the
 * filter blasting open and closing over the note, a brass "blat" that lands like a door.
 */
export function braam(mix: Mix, time: number, notes: readonly number[], duration: number, velocity: number, route: Route) {
  const left = buffer(duration + .6), right = buffer(duration + .6);
  notes.forEach(midi => {
    const voices = [-18, -6, 6, 18].map((cents, i) => ({saw: new Saw(mix.random()), hz: mtof(midi + cents / 100), gains: panGains((i / 3 - .5) * 1.2)}));
    const sub = new Sine(), fl = new Svf(), fr = new Svf();
    for (let i = 0; i < left.length; i++) {
      const t = i / SR, env = gateEnv(t, .012, duration, .6);
      const open = Math.exp(-t / (duration * .45)), cutoff = mtof(midi) * (1.5 + 14 * open) + 120;
      let l = 0, r = 0;
      for (const voice of voices) { const value = voice.saw.next(voice.hz * (1 - .01 * Math.exp(-t / .05))); l += value * voice.gains[0]; r += value * voice.gains[1]; }
      const low = sub.next(mtof(midi) / 2) * .8;
      left[i] += Math.tanh((fl.process(l, cutoff, 1.3) + low) * 1.8) * env;
      right[i] += Math.tanh((fr.process(r, cutoff, 1.3) + low) * 1.8) * env;
    }
  });
  const g = velocity * .2 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { left[i] *= g; right[i] *= g; }
  mix.emit(time, route, left, right); mix.count('braam');
}

/** Taiko: a huge low skin with a deep pitch sag, a slap on top and a room-filling tail. */
export function taiko(mix: Mix, time: number, velocity: number, route: Route, pitch = 1) {
  const out = buffer(1.6), skin = new Sine(), ring = new Sine(), slap = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, hz = (58 + 70 * Math.exp(-t / .04)) * pitch;
    slap.process(noise(mix), 1100 * pitch, .9);
    out[i] = (Math.tanh(skin.next(hz) * 2.2) * Math.exp(-t / .45) + ring.next(hz * 2.3) * .2 * Math.exp(-t / .12) + slap.bp * Math.exp(-t / .02) * 1.2) * Math.min(1, t / .001) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('taiko');
}

/** Screaming lead: two detuned saws plus a third an octave up, vibrato, portamento from `from`. */
export function lead(mix: Mix, time: number, midi: number, duration: number, velocity: number, route: Route, options: {from?: number; vibrato?: number} = {}) {
  const out = buffer(duration + .15), a = new Saw(mix.random()), b = new Saw(mix.random()), c = new Saw(mix.random()), tone = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, glide = options.from === undefined ? 0 : (options.from - midi) * Math.exp(-t / .04);
    const vib = (options.vibrato ?? .3) * clamp((t - .12) / .2) * Math.sin(2 * Math.PI * 6 * t);
    const hz = mtof(midi + glide + vib);
    const value = a.next(hz * 1.004) + b.next(hz * .996) + c.next(hz * 2) * .35;
    out[i] = tone.process(value, 2200 + 4000 * Math.exp(-t / .25), 1.2) * gateEnv(t, .004, duration, .12) * velocity * .12;
  }
  mix.emit(time, route, out); mix.count('lead');
}

/** Klaxon: a hard square that alternates two pitches `rate` times a second. */
export function alarm(mix: Mix, time: number, duration: number, velocity: number, route: Route, options: {high?: number; low?: number; rate?: number} = {}) {
  const out = buffer(duration + .05), tone = new Svf(), high = mtof(options.high ?? 81), low = mtof(options.low ?? 76), rate = options.rate ?? 7;
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, hz = Math.floor(t * rate) % 2 ? low : high;
    phase = (phase + hz / SR) % 1;
    out[i] = tone.process(phase < .5 ? 1 : -1, 3200, .9) * gateEnv(t, .003, duration, .04) * velocity * .09;
  }
  mix.emit(time, route, out); mix.count('alarm');
}

/** Laser zap: a square and a sine diving exponentially from `from` to `to` Hz (floored at 20 Hz; the sweep is NaN at ≤ 0). */
export function zap(mix: Mix, time: number, velocity: number, route: Route, options: {from?: number; to?: number; duration?: number} = {}) {
  const duration = options.duration ?? .16, out = buffer(duration), from = Math.max(20, options.from ?? 3200), to = Math.max(20, options.to ?? 180), sine = new Sine(), tone = OnePole.lowpass(6000);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, hz = from * (to / from) ** (t / duration);
    phase = (phase + hz / SR) % 1;
    out[i] = tone.process((phase < .5 ? .5 : -.5) + sine.next(hz)) * (1 - t / duration) ** 1.5 * Math.min(1, t / .001) * velocity * .16;
  }
  mix.emit(time, route, out); mix.count('zap');
}

/** Hard four-on-the-floor kick: a click, a punchy pitch drop and a long sub tail. */
export function bigKick(mix: Mix, time: number, velocity: number, route: Route, tail = .35) {
  const out = buffer(tail + .15), body = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, hz = 48 + 180 * Math.exp(-t / .03) + 900 * Math.exp(-t / .002);
    out[i] = Math.tanh(body.next(hz) * 2.4) * Math.exp(-t / tail) * Math.min(1, t / .0005) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('bigKick');
}
