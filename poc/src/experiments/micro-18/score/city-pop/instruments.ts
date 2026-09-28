import {OnePole, Saw, Sine, Svf, gateEnv, mtof, panGains} from '../dsp';
import type {Mix, Route} from '../voices';

const SR = 48_000;

/**
 * Clean electric guitar, Karplus-Strong: a pick-shaped noise burst circulating in a tuned delay line.
 * `mute` (0..1) is the palm: it shortens the ring and darkens the loop, down to a percussive chk.
 */
export function guitar(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {length?: number; mute?: number; bright?: number} = {}) {
  const mute = options.mute ?? 0, bright = options.bright ?? .6, length = options.length ?? 1.4;
  const hz = mtof(midi), period = SR / hz, out = new Float32Array(Math.round((length + .05) * SR));
  const decay = (1.4 - 1.3 * mute) * 2 ** (-(midi - 52) / 24), loss = Math.exp(-1 / (decay * hz));
  const pick = OnePole.lowpass(900 + 6500 * bright * velocity), palm = OnePole.lowpass(9000 - 7000 * mute), body = OnePole.lowpass(90);
  const read = (position: number) => { const i = Math.floor(position), f = position - i; return out[i] + (out[i + 1] - out[i]) * f; };
  for (let n = 0; n < out.length; n++) {
    const excite = n < period ? pick.process(mix.random() * 2 - 1) * Math.sin(Math.PI * n / period) : 0;
    const position = n - period + .5;
    out[n] = excite + (position >= 1 ? palm.process(loss * .5 * (read(position) + read(position - 1))) : 0);
  }
  for (let n = 0; n < out.length; n++) {
    const t = n / SR, value = out[n];
    out[n] = (value - body.process(value)) * gateEnv(t, .0005, length, .04) * velocity * 1.5;
  }
  mix.emit(time, route, out); mix.count('guitar');
}

/** A chord strummed across the strings, low → high on a downstroke. */
export const strum = (mix: Mix, time: number, notes: readonly number[], velocity: number, route: Route, options: {length?: number; mute?: number; bright?: number; spread?: number; up?: boolean} = {}) =>
  (options.up ? [...notes].reverse() : notes).forEach((midi, i) => guitar(mix, time + i * (options.spread ?? .008), midi, velocity * (1 - i * .06), {...route, pan: (route.pan ?? 0) + (i - notes.length / 2) * .06}, options));

/** Soft synth bass: a saw and a sine under a plucky resonant low-pass. */
export function synthBass(mix: Mix, time: number, midi: number, duration: number, velocity: number, route: Route, options: {bright?: number} = {}) {
  const hz = mtof(midi), out = new Float32Array(Math.round((duration + .08) * SR)), saw = new Saw(mix.random()), sine = new Sine(), filter = new Svf();
  for (let n = 0; n < out.length; n++) {
    const t = n / SR, cutoff = hz * 1.6 + (250 + 2200 * (options.bright ?? .5) * velocity) * Math.exp(-t / .07);
    out[n] = filter.process(saw.next(hz) * .5 + sine.next(hz) * .9, cutoff, 1.3) * gateEnv(t, .003, duration, .06) * velocity * .2;
  }
  mix.emit(time, route, out); mix.count('synthBass');
}

/** Brass synth: three detuned saws whose filter opens on the attack like a breath, with a delayed vibrato. */
export function brass(mix: Mix, time: number, notes: readonly number[], duration: number, velocity: number, route: Route, options: {bright?: number; attack?: number} = {}) {
  const length = Math.round((duration + .2) * SR), left = new Float32Array(length), right = new Float32Array(length);
  const attack = options.attack ?? .03, bright = options.bright ?? .6;
  notes.forEach(midi => [-8, 0, 7].forEach((cents, i) => {
    const saw = new Saw(mix.random()), filter = new Svf(), hz = mtof(midi + cents / 100), [gl, gr] = panGains((i - 1) * .55);
    for (let n = 0; n < length; n++) {
      const t = n / SR, vibrato = 2 ** (12 * Math.min(1, Math.max(0, (t - .25) / .3)) * Math.sin(2 * Math.PI * 5.4 * t) / 1200);
      const cutoff = hz * 1.2 + (1200 + 3600 * bright * velocity) * Math.min(1, t / (attack * 2)) * (.6 + .4 * Math.exp(-t / .18));
      const value = filter.process(saw.next(hz * vibrato), cutoff, .9) * gateEnv(t, attack, duration, .15);
      left[n] += value * gl; right[n] += value * gr;
    }
  }));
  const level = velocity * .12 / Math.sqrt(notes.length);
  for (let n = 0; n < length; n++) { left[n] *= level; right[n] *= level; }
  mix.emit(time, route, left, right); mix.count('brass');
}
