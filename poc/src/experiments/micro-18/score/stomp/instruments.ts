import {OnePole, Sine, Svf, mtof, pluckEnv} from '../dsp';
import type {Mix, Route} from '../voices';

const SR = 48_000;

/** A foot on a wooden stage: a short falling thump with the boards' low knock on top. */
export function stomp(mix: Mix, time: number, velocity: number, route: Route) {
  const out = new Float32Array(Math.round(.4 * SR)), body = new Sine(), boards = new Svf(), soften = OnePole.lowpass(2200);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR, hz = 48 + 60 * Math.exp(-t / .02);
    boards.process(mix.random() * 2 - 1, 240, 1.2);
    out[n] = soften.process(Math.tanh(body.next(hz) * 1.3) * Math.exp(-t / .11) + boards.bp * 1.6 * Math.exp(-t / .035)) * velocity * .55;
  }
  mix.emit(time, route, out); mix.count('stomp');
}

/** Tambourine: the head's tap and three bands of jingles ringing briefly after it. */
export function tambourine(mix: Mix, time: number, velocity: number, route: Route, ring = .06) {
  const out = new Float32Array(Math.round((ring * 5 + .01) * SR)), bands = [6800, 9200, 11500].map(() => new Svf()), head = new Svf();
  for (let n = 0; n < out.length; n++) {
    const t = n / SR, noise = mix.random() * 2 - 1;
    const jingles = bands.reduce((sum, band, i) => { band.process(noise, [6800, 9200, 11500][i], 5); return sum + band.bp; }, 0);
    head.process(noise, 900, 1);
    out[n] = (jingles * pluckEnv(t, .002, ring) * .8 + head.bp * Math.exp(-t / .008) * .5) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('tambourine');
}

/** Glockenspiel: a steel bar's fundamental with its 2.76 and 5.40 partials dying first, and the mallet's tick. */
export function glock(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number} = {}) {
  const decay = options.decay ?? 1.2, hz = mtof(midi), out = new Float32Array(Math.round((decay * 4 + .02) * SR));
  const [f1, f2, f3] = [new Sine(), new Sine(), new Sine()], mallet = new Svf();
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    mallet.process(mix.random() * 2 - 1, 5000, 1);
    const value = f1.next(hz) * Math.exp(-t / decay) + .3 * f2.next(hz * 2.76) * Math.exp(-t / (decay * .25)) + .12 * f3.next(hz * 5.4) * Math.exp(-t / (decay * .1)) + mallet.bp * .25 * Math.exp(-t / .003);
    out[n] = value * Math.min(1, t / .0008) * velocity * .15;
  }
  mix.emit(time, route, out); mix.count('glock');
}
