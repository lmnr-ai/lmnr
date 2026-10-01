import {Sine, Svf, clamp, mtof, panGains, samples, type Rng} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * LAM-2317 v3 primitives, measured on the Cursor reference's Demucs music stem. Its tactile layer is
 * almost entirely tone, not noise: pure sine pops and thumps on chord tones with no pitch drop, dry and
 * centred, a separate faint high click, droplets that glide down, and only two smooth swishes. Its
 * "melody" is soft keys that swell in and repeat inside a near-static chord.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (random: Rng) => random() * 2 - 1;
const rise = (t: number, attack: number) => t >= attack ? 1 : .5 - .5 * Math.cos(Math.PI * t / attack);

/**
 * Swelled key: a near-sine (2nd harmonic -14 dB, 3rd -21 dB, 4th -30 dB) with a +12-cent chorus copy at -6 dB that
 * swells in over `swell` (the reference's median is 255 ms), then decays at about -15 dB/s.
 */
export function swellKey(mix: Mix, time: number, midi: number, velocity: number, route: Route, swell = .25, length = 1.6) {
  const out = buffer(length), hz = mtof(midi), main = [0, 1, 2, 3].map(() => new Sine(mix.random())), chorus = new Sine(mix.random());
  const fade = samples(.25);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, envelope = rise(t, swell) * (t < swell ? 1 : Math.exp(-(t - swell) / .55));
    const value = main[0].next(hz) + .2 * main[1].next(2 * hz) + .09 * main[2].next(3 * hz) + .03 * main[3].next(4 * hz) + .5 * chorus.next(hz * 2 ** (12 / 1200));
    out[i] = value * envelope * velocity * .06 * Math.min(1, (out.length - i) / fade);
  }
  mix.emit(time, route, out); mix.count('swellKey');
}

/** Pop: a pure sine on a chord tone with a 4 ms raised-cosine attack, a 4 ms fall and a -18 dB tail (τ 40 ms). No pitch drop. */
export function pop(mix: Mix, time: number, midi: number, velocity: number, route: Route) {
  const out = buffer(.22), tone = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, after = Math.max(0, t - .004);
    out[i] = tone.next(hz) * rise(t, .004) * (Math.exp(-after / .004) * .874 + .126 * Math.exp(-after / .04)) * velocity * .4;
  }
  mix.emit(time, route, out); mix.count('pop');
}

/**
 * Thump: a flat sine at B♭2/D♭3 height (8 ms attack, τ 15 ms, then a -20 dB tail at τ 50 ms) with an
 * optional softer double hit 70 ms later and a separate 0.6 ms high click at -24 dB, as the reference's are built.
 */
export function thump(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {double?: boolean; click?: number} = {}) {
  const out = buffer(.42), hz = mtof(midi), click = new Svf(), clickLevel = (options.click ?? 1) * .063;
  const hits = options.double ? [[0, 1], [.07, .7]] : [[0, 1]];
  const tones = hits.map(() => new Sine());
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    let value = 0;
    hits.forEach(([at, gain], k) => {
      const local = t - at;
      if (local < 0) { tones[k].next(hz); return; }
      const after = Math.max(0, local - .008), body = local < .04 ? Math.exp(-after / .015) : Math.exp(-.032 / .015) * Math.exp(-(local - .04) / .05);
      value += tones[k].next(hz) * rise(local, .008) * (body * .9 + .1 * Math.exp(-after / .05)) * gain;
    });
    click.process(noise(mix.random), 3500, .8);
    value += t < .0006 ? click.bp * clickLevel * 4 : click.bp * clickLevel * 4 * Math.exp(-(t - .0006) / .0004);
    out[i] = Math.tanh(value * velocity * .9) * .55;
  }
  mix.emit(time, route, out); mix.count('thump');
}

/** Tick: half a 1.8 kHz sine, half narrow-band noise (Q 3), 1 ms attack, τ 5 ms. */
export function tick(mix: Mix, time: number, velocity: number, route: Route, hz = 1800) {
  const out = buffer(.04), tone = new Sine(), band = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    band.process(noise(mix.random), hz * .75, 3);
    out[i] = (tone.next(hz) * .5 + band.bp * 1.4) * rise(t, .001) * Math.exp(-Math.max(0, t - .001) / .005) * velocity * .2;
  }
  mix.emit(time, route, out); mix.count('tick');
}

/** Droplet: a sine that glides down exponentially (default 400 → 180 Hz over 120 ms), 10 ms attack, τ 80 ms. */
export function droplet(mix: Mix, time: number, velocity: number, route: Route, from = 400, to = 180) {
  const out = buffer(.45), tone = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, hz = to + (from - to) * Math.exp(-t / .045);
    out[i] = tone.next(hz) * rise(t, .01) * Math.exp(-Math.max(0, t - .01) / .08) * velocity * .4;
  }
  mix.emit(time, route, out); mix.count('droplet');
}

/** Click: a 0.3 ms broadband impulse above 4 kHz, quiet, for the reference's ping-pong and hard-panned clicks. */
export function click(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.012), hp = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    hp.process(noise(mix.random) * (t < .0003 ? 1 : Math.exp(-(t - .0003) / .0006)), 4000, .7);
    out[i] = hp.hp * velocity * .16;
  }
  mix.emit(time, route, out); mix.count('click');
}

/** Dots: 2 ms high (4–6 kHz) blips at a steady rate, the reference's quiet ratchet. */
export function dots(mix: Mix, start: number, end: number, route: Route, options: {rate?: number; level?: [number, number]; pan?: [number, number]} = {}) {
  const rate = options.rate ?? 11, [v0, v1] = options.level ?? [1, .4], [p0, p1] = options.pan ?? [0, 0];
  for (let t = start; t < end; t += 1 / rate) {
    const x = clamp((t - start) / Math.max(.01, end - start)), out = buffer(.008), band = new Svf();
    const velocity = (v0 + (v1 - v0) * x) * (.8 + .4 * mix.random());
    for (let i = 0; i < out.length; i++) {
      const s = i / 48_000;
      band.process(noise(mix.random), 5000, 2);
      out[i] = band.bp * (s < .002 ? Math.sin(Math.PI * s / .002) : 0) * velocity * .05;
    }
    mix.emit(t + (mix.random() - .5) * .006, {...route, pan: p0 + (p1 - p0) * x}, out);
  }
  mix.count('dots');
}

/**
 * Breath: the replacement for `paper`. Pink noise with no grain, crackle or drive, through two cascaded
 * gentle (Q 0.5) filters, under a bell-shaped envelope (45 % rise, 55 % fall). "pillow" low-passes along
 * `from` → `to`; "feather" band-passes around 3–9 kHz. Mid noise is shared and the side is independent at -6 dB.
 */
export function breath(mix: Mix, time: number, duration: number, route: Route,
  options: {kind?: 'pillow' | 'feather'; level?: number; from?: number; to?: number; peak?: number; pan?: [number, number]} = {}) {
  if (duration <= 0) return;
  const kind = options.kind ?? 'pillow', left = buffer(duration), right = buffer(duration);
  const from = options.from ?? (kind === 'pillow' ? 250 : 3000), to = options.to ?? (kind === 'pillow' ? 1200 : 9000), peak = options.peak ?? .45;
  const [pan0, pan1] = options.pan ?? [0, 0];
  const pink = () => { let b0 = 0, b1 = 0, b2 = 0; return () => { const w = noise(mix.random); b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; return (b0 + b1 + b2 + w * .1848) * .25; }; };
  const sources = [pink(), pink(), pink()], filters = [0, 1, 2].map(() => [new Svf(), new Svf()]);
  const shape = (x: number) => Math.exp(-(((x - peak) / (x < peak ? peak : 1 - peak)) ** 2) * 4.5);
  const edge = (x: number) => Math.min(1, x * 20, (1 - x) * 20);
  for (let i = 0; i < left.length; i++) {
    const x = i / left.length, hz = from * (to / from) ** (x < peak ? x / peak : 1 - .6 * (x - peak) / (1 - peak));
    const [mid, sl, sr] = sources.map((next, k) => {
      const [a, b] = filters[k], input = next();
      if (kind === 'pillow') return b.process(a.process(input, hz, .5), hz, .5);
      a.process(input, hz, .5); b.process(a.bp, hz * 1.3, .5);
      return b.bp;
    });
    const [gl, gr] = panGains(pan0 + (pan1 - pan0) * x), g = shape(x) * edge(x) * (options.level ?? .5) * (kind === 'pillow' ? 1.1 : 1.6);
    left[i] = (mid + .5 * sl) * gl * Math.SQRT2 * g; right[i] = (mid + .5 * sr) * gr * Math.SQRT2 * g;
  }
  mix.emit(time, route, left, right); mix.count('breath');
}
