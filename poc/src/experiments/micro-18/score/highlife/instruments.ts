import {OnePole, Sine, Svf, mtof, pluckEnv} from '../dsp';
import type {Mix, Route} from '../voices';

const SR = 48_000;

/**
 * Hand drum: a skin that drops a fifth into its pitch, plus a band-passed slap of the palm.
 * `slap` 0 is an open tone, 1 a dry cracking slap; `mute` damps the skin like a heel tone.
 */
export function conga(mix: Mix, time: number, hz: number, velocity: number, route: Route, options: {slap?: number; mute?: number} = {}) {
  const slap = options.slap ?? 0, mute = options.mute ?? 0, out = new Float32Array(Math.round(.45 * SR));
  const skin = new Sine(), palm = new Svf(), decay = (.16 - .1 * mute) * (1 - .45 * slap);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR, pitch = hz * (1 + .5 * Math.exp(-t / .006));
    palm.process(mix.random() * 2 - 1, 1800 + 1600 * slap, .9);
    out[n] = (skin.next(pitch) * pluckEnv(t, .001, decay) * (1 - .5 * slap) + palm.bp * Math.exp(-t / (.006 + .016 * slap)) * (.35 + 1.2 * slap)) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('conga');
}

/** Balafon: a wooden bar (FM with a fast-dying inharmonic partial) and the gourd's short buzz. */
export function balafon(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number} = {}) {
  const decay = options.decay ?? .32, hz = mtof(midi), out = new Float32Array(Math.round((decay * 5 + .02) * SR));
  const bar = new Sine(), mod = new Sine(), overtone = new Sine(), buzz = new Svf(), soften = OnePole.lowpass(7000);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR, modulation = mod.next(hz * 4) * hz * 1.4 * Math.exp(-t / .012);
    buzz.process(mix.random() * 2 - 1, hz * 2, 3);
    const value = bar.next(hz + modulation) + .3 * overtone.next(hz * 3.93) * Math.exp(-t / .03) + buzz.bp * .12 * Math.exp(-t / .05);
    out[n] = soften.process(value) * pluckEnv(t, .001, decay) * velocity * .16;
  }
  mix.emit(time, route, out); mix.count('balafon');
}
