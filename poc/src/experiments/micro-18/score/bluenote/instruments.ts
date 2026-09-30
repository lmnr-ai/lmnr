import {OnePole, Saw, Sine, Svf, clamp, gateEnv, mtof, samples, SR} from '../dsp';
import {string} from '../rounded';
import type {Mix, Route} from '../voices';

/*
 * The Bluenote band: synthesized cymbals, a walking upright, toms and a horn section. The piano is
 * the Salamander bank through `piano()`; everything here is built from saws, sines and noise.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (mix: Mix) => mix.random() * 2 - 1;

/** Inharmonic square partials (the classic 808 metal set, scaled): the shimmer under every cymbal. */
const METAL = [1, 1.4827, 1.8003, 2.5461, 2.6297, 3.8967];

export type CymbalKind = 'ride' | 'crash' | 'hat' | 'openHat' | 'bell';
const CYMBALS: Record<CymbalKind, {base: number; hp: number; decay: number; metal: number; ping?: number; pingDecay?: number; gain: number}> = {
  ride: {base: 410, hp: 4200, decay: .9, metal: .5, ping: 3100, pingDecay: .18, gain: .3},
  bell: {base: 520, hp: 2600, decay: .8, metal: .8, ping: 2350, pingDecay: .5, gain: .3},
  crash: {base: 330, hp: 3000, decay: 2.2, metal: .45, gain: .5},
  hat: {base: 560, hp: 7200, decay: .045, metal: .5, gain: .3},
  openHat: {base: 560, hp: 6400, decay: .32, metal: .5, gain: .28},
};

/** Struck cymbal: metallic squares and noise through a high-pass; the ride adds a stick ping. */
export function cymbal(mix: Mix, time: number, kind: CymbalKind, velocity: number, route: Route, options: {decay?: number} = {}) {
  const spec = CYMBALS[kind], decay = options.decay ?? spec.decay;
  const out = buffer(decay * 4 + .02), phases = METAL.map(() => mix.random()), high = new Svf(), ping = new Svf(), air = OnePole.lowpass(13000);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    let metal = 0;
    METAL.forEach((ratio, k) => { phases[k] = (phases[k] + spec.base * ratio / SR) % 1; metal += phases[k] < .5 ? 1 : -1; });
    const source = metal / METAL.length * spec.metal + noise(mix) * (1 - spec.metal);
    high.process(source, spec.hp, .7);
    let value = high.hp * (t < .0015 ? t / .0015 : 1) * Math.exp(-t / decay) * (1 + 1.5 * Math.exp(-t / .006));
    if (spec.ping) { ping.process(source, spec.ping, 6); value += ping.bp * Math.exp(-t / spec.pingDecay!) * .9; }
    out[i] = air.process(value) * velocity * spec.gain;
  }
  mix.emit(time, route, out); mix.count(kind === 'crash' ? 'crash' : kind === 'ride' || kind === 'bell' ? 'ride' : 'hat');
}

/** Mallet roll on a suspended cymbal, swelling into `end` and ringing on: the camera-move cymbal. */
export function cymbalSwell(mix: Mix, start: number, end: number, velocity: number, route: Route, options: {ring?: number; hp?: number} = {}) {
  const duration = end - start; if (duration <= 0) return;
  const ring = options.ring ?? 1.2, out = buffer(duration + ring * 3), phases = METAL.map(() => mix.random()), high = new Svf(), body = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, p = clamp(t / duration);
    let metal = 0;
    METAL.forEach((ratio, k) => { phases[k] = (phases[k] + 300 * ratio / SR) % 1; metal += phases[k] < .5 ? 1 : -1; });
    const source = metal / METAL.length * .35 + noise(mix) * .65;
    high.process(source, (options.hp ?? 2600) * (.6 + .4 * p), .6); body.process(source, 1400 + 1800 * p, 1.2);
    const env = t < duration ? p ** 2.2 : Math.exp(-(t - duration) / ring);
    out[i] = (high.hp + body.bp * .35) * env * velocity * .28;
  }
  mix.emit(start, route, out); mix.count('cymbalSwell');
}

/** Tuned tom: a skin that sags in pitch under a stick-noise attack. */
export function tom(mix: Mix, time: number, midi: number, velocity: number, route: Route) {
  const out = buffer(.6), skin = new Sine(), overtone = new Sine(), stick = new Svf(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, sag = 1 + .25 * Math.exp(-t / .03);
    stick.process(noise(mix), 2400, .8);
    out[i] = (Math.tanh(skin.next(hz * sag) * 1.4) * Math.exp(-t / .22) + overtone.next(hz * 1.59 * sag) * .3 * Math.exp(-t / .08) + stick.bp * Math.exp(-t / .006) * .7) * velocity * .45;
  }
  mix.emit(time, route, out); mix.count('tom');
}

/** Upright bass: a dark plucked string over a finger thump at the fundamental. */
export function upright(mix: Mix, time: number, midi: number, velocity: number, route: Route, length = .55) {
  string(mix, time, midi, velocity, route, {length, damping: .993, bright: .22});
  const out = buffer(.14), thump = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = thump.next(hz) * Math.min(1, t / .002) * Math.exp(-t / .045) * velocity * .22; }
  mix.emit(time, route, out);
}

export type HornKind = 'trumpet' | 'alto' | 'tenor' | 'bone';
const HORNS: Record<HornKind, {bright: number; formant: number; breath: number}> = {
  trumpet: {bright: 5.5, formant: 1400, breath: .03}, alto: {bright: 4, formant: 1100, breath: .06},
  tenor: {bright: 3.2, formant: 750, breath: .07}, bone: {bright: 2.6, formant: 520, breath: .03},
};

/**
 * Horn: two saws through a low-pass that opens with the breath (brass gets brighter as it gets
 * louder) and a body formant. `scoop` bends in from below, `fall` drops off the end, `rip` glisses
 * up into the note, `wah` works a plunger mute at that many strokes per second.
 */
export function horn(mix: Mix, time: number, midi: number, duration: number, velocity: number, route: Route, options: {
  kind?: HornKind; scoop?: number; fall?: number; rip?: number; wah?: number; vibrato?: number; attack?: number; swell?: number;
} = {}) {
  const spec = HORNS[options.kind ?? 'trumpet'], fall = options.fall ?? 0, rip = options.rip ?? 0, scoop = options.scoop ?? .6;
  const attack = options.attack ?? .025, fallTime = fall ? Math.min(.35, duration * .6) : 0;
  const length = duration + .1, out = buffer(length), a = new Saw(mix.random()), b = new Saw(mix.random()), tone = new Svf(), body = new Svf(), breath = new Svf();
  const hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, into = rip ? clamp(t / .09) : 1;
    let semis = -scoop * Math.exp(-t / .035) - rip * (1 - into * into * (3 - 2 * into));
    if (fall && t > duration - fallTime) semis -= fall * ((t - duration + fallTime) / fallTime) ** 2;
    const vib = (options.vibrato ?? .25) * clamp((t - .18) / .25) * Math.sin(2 * Math.PI * 5.6 * t);
    const f = hz * 2 ** ((semis + vib * .5) / 12);
    const env = gateEnv(t, attack, Math.max(0, duration - attack), .08) * (1 + (options.swell ?? 0) * clamp(t / Math.max(.05, duration)));
    const loud = env * (.35 + .65 * velocity);
    const plunger = options.wah ? .25 + .75 * (.5 - .5 * Math.cos(2 * Math.PI * options.wah * t)) : 1;
    const cutoff = Math.min(9000, hz * (1 + spec.bright * loud * plunger) + 250);
    tone.process((a.next(f * 1.002) + b.next(f * .998)) * .5, cutoff, .8);
    body.process(tone.lp, spec.formant * (options.wah ? .6 + .6 * plunger : 1), 1.4);
    breath.process(noise(mix), spec.formant * 2, 1);
    out[i] = (tone.lp * .8 + body.bp * .6 + breath.bp * spec.breath * loud) * loud * .3;
  }
  mix.emit(time, route, out); mix.count(options.kind ?? 'trumpet');
}

/** Horn section voicing: trumpet on top, then alto, tenor, trombone down the chord, spread across the stage. */
export function section(mix: Mix, time: number, notes: readonly number[], duration: number, velocity: number, route: Route, options: {fall?: number; scoop?: number; rip?: number; swell?: number} = {}) {
  const sorted = [...notes].sort((x, y) => y - x), kinds: HornKind[] = ['trumpet', 'alto', 'tenor', 'bone', 'bone'];
  sorted.forEach((midi, i) => horn(mix, time + i * .004, midi, duration, velocity * (i ? .82 : 1), {...route, pan: (route.pan ?? 0) + [.25, -.3, .4, -.15, 0][i % 5]}, {
    kind: kinds[Math.min(i, kinds.length - 1)], fall: options.fall, scoop: options.scoop, rip: options.rip ? options.rip + i : 0, swell: options.swell, vibrato: .15,
  }));
}
