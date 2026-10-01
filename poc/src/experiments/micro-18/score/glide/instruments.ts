import {OnePole, Saw, Sine, Svf, clamp, gateEnv, mtof, panGains, pluckEnv, samples} from '../dsp';
import {bell, pumpGain, type Mix, type Pump, type Route} from '../voices';

/*
 * The TurboPuffer-reference palette: nothing is struck hard. Tone arrives as filtered swells, rhythm as
 * muffled low thumps, detail as tiny high glints. Brightness is carried by one timeline filter (see
 * composition.ts), so these voices are rendered open and the arc darkens or opens them all together.
 */

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));
const noise = (mix: Mix) => mix.random() * 2 - 1;

/**
 * Wide, soft synth pad: a sine and two detuned saws per note, each ear chorused apart. `coherent` shares the
 * sine across both ears and narrows the saw detune, so the pad survives a mono fold-down; `pump` breathes on the grid.
 */
export function haze(mix: Mix, start: number, end: number, notes: readonly number[], route: Route, options: {attack?: number; release?: number; level?: number; tone?: number; coherent?: boolean; pump?: Pump} = {}) {
  const attack = options.attack ?? 1.4, release = options.release ?? 2, tone = options.tone ?? 2600;
  if (end <= start) return;
  const left = buffer(end - start + release), right = buffer(end - start + release);
  notes.forEach((midi, index) => {
    // Draw the shared phase only when coherent, so the default keeps its random sequence (and the v1 bed).
    const hz = mtof(midi), spread = options.coherent ? .0015 : .0045, phase = options.coherent ? mix.random() : 0, drift = options.coherent ? mix.random() * 6.28 : 0;
    const voices = [0, 1].map(ear => ({
      sine: new Sine(options.coherent ? phase : mix.random()), a: new Saw(mix.random()), b: new Saw(mix.random()), filter: new Svf(),
      drift: options.coherent ? drift : mix.random() * 6.28, detune: ear ? 1 + spread : 1 - spread,
    }));
    const hold = Math.max(0, end - start - attack), [spreadL, spreadR] = panGains((index % 2 ? .35 : -.35) * (index / Math.max(1, notes.length - 1)));
    for (let i = 0; i < left.length; i++) {
      const t = i / 48_000, envelope = gateEnv(t, attack, hold, release);
      if (envelope === 0 && t > attack) continue;
      const [l, r] = voices.map(voice => {
        const wobble = 1 + .0018 * Math.sin(t * .9 + voice.drift);
        const raw = voice.sine.next(hz * wobble) * .8 + (voice.a.next(hz * voice.detune * wobble) + voice.b.next(hz / voice.detune)) * .22;
        return voice.filter.process(raw, tone * (1 + .12 * Math.sin(t * .37 + voice.drift)), .6);
      });
      left[i] += l * envelope * spreadL * 1.4; right[i] += r * envelope * spreadR * 1.4;
    }
  });
  const level = (options.level ?? 1) * .07 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { const g = level * pumpGain(options.pump, start + i / 48_000); left[i] *= g; right[i] *= g; }
  mix.emit(start, route, left, right); mix.count('haze');
}

/** Breathing air: decorrelated band-passed noise whose band and level follow `shape`. */
export function air(mix: Mix, start: number, end: number, route: Route, options: {hz: number; level: number; q?: number; shape?: (progress: number) => number}) {
  if (end <= start) return;
  const left = buffer(end - start), right = buffer(end - start), ears = [new Svf(), new Svf()];
  const shape = options.shape ?? (progress => Math.sin(Math.PI * progress));
  for (let i = 0; i < left.length; i++) {
    const progress = i / left.length, g = shape(progress) * options.level;
    const hz = options.hz * (1 + .15 * Math.sin(i / 48_000 * .6));
    ears[0].process(noise(mix), hz, options.q ?? .8); ears[1].process(noise(mix), hz, options.q ?? .8);
    left[i] = ears[0].bp * g; right[i] = ears[1].bp * g;
  }
  mix.emit(start, route, left, right); mix.count('air');
}

/** Sub drone: a pure sine that swells in and can sag (`toMidi`) at the end, like a slowing tape. */
export function drone(mix: Mix, start: number, end: number, midi: number, route: Route, options: {level: number; toMidi?: number; attack?: number; release?: number}) {
  const attack = options.attack ?? .8, release = options.release ?? .6;
  if (end <= start) return;
  const out = buffer(end - start + release), sine = new Sine(), second = new Sine();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = clamp(t / (end - start));
    const hz = mtof(midi + ((options.toMidi ?? midi) - midi) * progress ** 3);
    out[i] = (sine.next(hz) + .18 * second.next(hz * 2)) * gateEnv(t, attack, Math.max(0, end - start - attack), release) * options.level;
  }
  mix.emit(start, route, out); mix.count('drone');
}

/** Muffled floor-tom thump: sine body falling in pitch plus felt noise, nothing above ~1 kHz. */
export function thump(mix: Mix, time: number, velocity: number, route: Route, pitch = 1) {
  const out = buffer(.5), body = new Sine(), felt = new Svf(), soften = OnePole.lowpass(1100);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    felt.process(noise(mix), 380 * pitch, .9);
    const value = Math.tanh(body.next((58 + 60 * Math.exp(-t / .035)) * pitch) * 1.4) * Math.exp(-t / .16) + felt.lp * Math.exp(-t / .03) * .6;
    out[i] = soften.process(value) * velocity * .2;
  }
  mix.emit(time, route, out); mix.count('thump');
}

/** A tiny sine glint high above the voice: the reference's "data" specks. */
export function glint(mix: Mix, time: number, midi: number, velocity: number, route: Route, decay = .05) {
  const out = buffer(decay * 6 + .004), osc = new Sine(), shimmer = new Sine();
  const hz = mtof(midi), octave = hz * 2.01 < 20_000 ? .3 : 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    out[i] = (osc.next(hz) + octave * shimmer.next(hz * 2.01)) * pluckEnv(t, .0015, decay) * velocity * .09;
  }
  mix.emit(time, route, out); mix.count('glint');
}

/** Warm electric-piano chord (FM ratio 1): the groove's comp and the resolved "lock" moments. */
export function keys(mix: Mix, time: number, notes: readonly number[], velocity: number, route: Route, decay = 1.2) {
  notes.forEach((midi, i) => bell(mix, time + i * .006, midi, velocity * (1 - i * .06), {...route, pan: (route.pan ?? 0) + (i % 2 ? .22 : -.22)}, {decay, ratio: 1, index: .7}));
}

/**
 * Shimmer riser: a sparkle shower whose density and pitch climb into `end`, over high-passed air.
 * `midi` is the scale the specks are drawn from, low to high.
 */
export function shimmer(mix: Mix, start: number, end: number, scale: readonly number[], route: Route, options: {level: number; density: [number, number]; soft?: boolean}) {
  const duration = end - start;
  if (duration <= 0) return;
  const swell = (progress: number) => progress ** 2.2 * (progress > .97 ? (1 - progress) / .03 : 1);
  // `soft` (linger): a quieter feather instead of white hiss under the specks, and half the specks, so it shimmers rather than pours.
  if (options.soft) feather(mix, start, end, {...route, pan: 0}, {hz: 8000, level: options.level * .2, shape: swell});
  else air(mix, start, end, {...route, pan: 0}, {hz: 7000, q: .5, level: options.level * .5, shape: swell});
  const density = options.soft ? options.density.map(d => d * .5) as [number, number] : options.density;
  for (let time = start; time < end;) {
    const progress = (time - start) / duration;
    const top = Math.floor(scale.length * (.35 + .65 * progress));
    const midi = scale[Math.min(scale.length - 1, Math.floor(mix.random() * top))];
    glint(mix, time, midi, options.level * (.35 + .65 * progress) * (.6 + .4 * mix.random()), {...route, pan: mix.random() * 1.6 - .8}, (.04 + .05 * mix.random()) * (options.soft ? 1.6 : 1));
    time += 1 / (density[0] + (density[1] - density[0]) * progress);
  }
}

// ---------------------------------------------------------------- the soft palette (`glide-minimal-linger`)
// Band-passed white noise in 1–9 kHz is what reads as sand: these voices use pink noise through low-Q (0.5) low- and
// high-passes only (no band-pass, no resonance), keep their energy under ~1.2 kHz with a faint top, and move slowly.

const pinkNoise = () => {
  let b0 = 0, b1 = 0, b2 = 0;
  return (mix: Mix) => {
    const white = noise(mix);
    b0 = .99765 * b0 + white * .099046; b1 = .963 * b1 + white * .2965164; b2 = .57 * b2 + white * 1.0526913;
    return (b0 + b1 + b2 + white * .1848) * .25;
  };
};
/** Soft cap on the sweep (2 kHz): `whoosh`'s 300 Hz–2.4 kHz paths land at ~300 Hz–1.2 kHz. */
const BREEZE_CAP = 2000, BREEZE_GAIN = 2;

export type BreezeOptions = {from: number; to: number; level: number; peak?: number; air?: number; panFrom?: number; panTo?: number};

/**
 * A pillow-soft whoosh with `whoosh`'s arguments (`q` and `tone` are ignored): pink noise through a one-pole low-pass that
 * rides the sweep and a Q 0.5 two-pole three times higher (so 6 dB/oct, steepening above), a 140 Hz high-pass so it never
 * drones, and a faint feather top (`air`, 2.6–6.5 kHz). Raised-cosine swell to and from silence. No band-pass, no resonance.
 */
export function breeze(mix: Mix, time: number, duration: number, route: Route, options: BreezeOptions) {
  const tune = mix.tuning.whoosh;
  duration *= tune.duration;
  if (duration <= 0) return;
  route = {...route, gain: (route.gain ?? 1) * tune.volume};
  const from = options.from * tune.frequency * 1.15, to = options.to * tune.frequency * 1.15, airLevel = (options.air ?? .2) * tune.air * .15;
  const tail = .05, left = buffer(duration + tail), right = buffer(duration + tail), peak = options.peak ?? .6;
  const soft = (hz: number) => hz * BREEZE_CAP / (hz + BREEZE_CAP);
  const ears = [0, 1].map(() => ({pink: pinkNoise(), slope: new OnePole(0), body: new Svf(), floor: new Svf(), top: new Svf(), topLow: new Svf()}));
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, progress = clamp(t / duration);
    const shaped = progress < peak ? Math.sin(progress / peak * Math.PI / 2) ** 2 : Math.cos((progress - peak) / (1 - peak) * Math.PI / 2) ** 2;
    const envelope = t > duration ? 0 : shaped; // already 0 at `duration`: the swell itself is the release
    const sweep = progress < peak ? progress / peak : 1 - (progress - peak) / (1 - peak) * .4;
    const cutoff = clamp(soft(from * (to / from) ** clamp(sweep)), 260, 1600);
    const [a, b] = ears.map(ear => {
      const source = ear.pink(mix);
      ear.slope.set(cutoff);
      ear.body.process(ear.slope.process(source), cutoff * 3, .5);
      ear.floor.process(ear.body.lp, 140, .5);
      ear.top.process(source, 2600, .5); ear.topLow.process(ear.top.hp, 6500, .5);
      return ear.floor.hp + ear.topLow.lp * airLevel;
    });
    const mid = (a + b) * .5, side = (a - b) * .35;
    const pan = (options.panFrom ?? 0) + ((options.panTo ?? 0) - (options.panFrom ?? 0)) * progress ** 2 * (3 - 2 * progress);
    const [gl, gr] = panGains(pan), g = envelope * options.level * BREEZE_GAIN;
    left[i] = (mid + side) * gl * Math.SQRT2 * g; right[i] = (mid - side) * gr * Math.SQRT2 * g;
  }
  mix.emit(time, route, left, right); mix.count('breeze');
}

/** `air` with the soft palette: pink noise between low-Q high- and low-passes (an octave and a half wide), no band-pass. */
export function feather(mix: Mix, start: number, end: number, route: Route, options: {hz: number; level: number; shape?: (progress: number) => number}) {
  if (end <= start) return;
  const left = buffer(end - start), right = buffer(end - start);
  const ears = [0, 1].map(() => ({pink: pinkNoise(), high: new Svf(), low: new Svf()}));
  const shape = options.shape ?? (progress => Math.sin(Math.PI * progress));
  for (let i = 0; i < left.length; i++) {
    const progress = i / left.length, g = shape(progress) * options.level * 1.75;
    const hz = options.hz * (1 + .1 * Math.sin(i / 48_000 * .6));
    const [a, b] = ears.map(ear => { ear.high.process(ear.pink(mix), hz * .55, .5); ear.low.process(ear.high.hp, hz * 1.5, .5); return ear.low.lp; });
    left[i] = a * g; right[i] = b * g;
  }
  mix.emit(start, route, left, right); mix.count('feather');
}

/** `tick` without its white-noise click: a pure, soft-edged sine blip, so fast counters glisten instead of crackle. */
export function blip(mix: Mix, time: number, midi: number, velocity: number, route: Route, decay = .012) {
  const out = buffer(decay * 6 + .004), osc = new Sine(), hz = mtof(midi);
  for (let i = 0; i < out.length; i++) out[i] = osc.next(hz) * pluckEnv(i / 48_000, .0015, decay * 1.4) * velocity * .19;
  mix.emit(time, route, out); mix.count('blip');
}
