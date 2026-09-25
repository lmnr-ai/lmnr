import {OnePole, Saw, Sine, Stereo, Svf, clamp, gateEnv, mtof, panGains, pluckEnv, samples, type Rng} from './dsp';

export type BusName = 'music' | 'sfx';
export type Route = {bus: BusName; gain?: number; pan?: number; hall?: number; room?: number; delay?: number};
export type PianoBank = readonly {midi: number; data: Float32Array}[];
export type StringSection = 'violin' | 'violins' | 'celli' | 'pizz';
/** VSCO-2 strings: each section holds a soft and a loud layer per sampled pitch (pizz is loud only). */
export type StringBanks = Partial<Record<StringSection, readonly {midi: number; dynamic: 'soft' | 'loud'; data: Float32Array}[]>>;

/** Dry buses plus three shared sends. Voices render mono or stereo buffers and `emit` them here. */
export class Mix {
  readonly music: Stereo; readonly sfx: Stereo; readonly hall: Stereo; readonly room: Stereo; readonly delay: Stereo;
  /** Gain multiplier applied to the music bus (and its sends) — lets foley breathe through the score. */
  readonly musicGain: Float32Array;
  readonly counts: Record<string, number> = {};
  constructor(readonly length: number, readonly random: Rng, readonly piano: PianoBank, readonly strings: StringBanks = {}) {
    this.music = new Stereo(length); this.sfx = new Stereo(length);
    this.hall = new Stereo(length); this.room = new Stereo(length); this.delay = new Stereo(length);
    this.musicGain = new Float32Array(length).fill(1);
  }
  count(kind: string) { this.counts[kind] = (this.counts[kind] ?? 0) + 1; }
  emit(time: number, route: Route, left: Float32Array, right: Float32Array = left) {
    const start = samples(time);
    const gain = route.gain ?? 1;
    const [panLeft, panRight] = panGains(route.pan ?? 0);
    const dry = route.bus === 'music' ? this.music : this.sfx;
    const sends: [Stereo, number][] = [[this.hall, route.hall ?? 0], [this.room, route.room ?? 0], [this.delay, route.delay ?? 0]];
    const stereo = left !== right;
    // Every voice ends on a 2 ms fade so truncated decays never click.
    const fadeFrom = left.length - 96;
    for (let i = 0; i < left.length; i++) {
      const n = start + i;
      if (n < 0) continue; if (n >= this.length) break;
      const g = (route.bus === 'music' ? gain * this.musicGain[n] : gain) * (i > fadeFrom ? (left.length - i) / 96 : 1);
      const l = (stereo ? left[i] : left[i] * panLeft) * g, r = (stereo ? right[i] : right[i] * panRight) * g;
      dry.l[n] += l; dry.r[n] += r;
      for (const [send, amount] of sends) if (amount) { send.l[n] += l * amount; send.r[n] += r * amount; }
    }
  }
  /** Buses touched by bus-level edits. Composition runs before foley, so the sends hold music only at that point. */
  private get musicBuses() { return [this.music, this.hall, this.room, this.delay]; }
  /**
   * Tape stop: everything emitted so far slows to a halt over `duration` and is then silent.
   * Call it mid-composition — notes emitted afterwards are untouched.
   */
  tapeStop(time: number, duration: number, curve = 1.6) {
    const start = samples(time), total = samples(duration), fade = 480;
    for (const bus of this.musicBuses) for (const channel of [bus.l, bus.r]) {
      if (start >= channel.length) continue;
      const source = channel.slice(start, Math.min(channel.length, start + total + 2));
      let position = 0;
      for (let i = 0; i < total && start + i < channel.length; i++) {
        const index = Math.floor(position), fraction = position - index;
        const value = index + 1 < source.length ? source[index] + (source[index + 1] - source[index]) * fraction : 0;
        channel[start + i] = value * (i > total - fade ? (total - i) / fade : 1);
        position += (1 - i / total) ** curve;
      }
      channel.fill(0, Math.min(channel.length, start + total));
    }
  }
  /** Repeat the `slice` that starts at `time`, `repeats` times, with 2 ms edges — a buffer glitch. */
  stutter(time: number, slice: number, repeats: number) {
    const start = samples(time), size = samples(slice), edge = 96;
    for (const bus of this.musicBuses) for (const channel of [bus.l, bus.r]) {
      const source = channel.slice(start, start + size);
      for (let k = 1; k < repeats; k++) for (let i = 0; i < size; i++) {
        const n = start + k * size + i; if (n >= channel.length) break;
        const window = Math.min(1, i / edge, (size - i) / edge);
        channel[n] = source[i] * window;
      }
    }
  }
  /** Dip the score under a foley moment; overlapping dips keep the deepest one. Must run before music is emitted. */
  duck(time: number, depth: number, attack: number, hold: number, release: number) {
    const start = samples(time - attack), total = samples(attack + hold + release);
    for (let i = 0; i < total; i++) {
      const n = start + i; if (n < 0 || n >= this.length) continue;
      const envelope = gateEnv(i / 48_000, attack, hold, release);
      this.musicGain[n] = Math.min(this.musicGain[n], 1 - (1 - depth) * envelope);
    }
  }
}

const buffer = (duration: number) => new Float32Array(Math.max(1, samples(duration)));

/** Sidechain-style pump: dips on every `period` from `origin`, recovering over ~60% of the period. */
export type Pump = {origin: number; period: number; depth: number};
const pumpGain = (pump: Pump | undefined, time: number) => {
  if (!pump || time < pump.origin) return 1;
  const phase = ((time - pump.origin) % pump.period) / pump.period;
  return 1 - pump.depth * (1 - clamp(phase / .6)) ** 2;
};
const noise = (random: Rng) => random() * 2 - 1;
/** Paul Kellet's economy pink filter: -3 dB/octave, so noise sounds like air rather than hiss. */
class Pink {
  private b0 = 0; private b1 = 0; private b2 = 0;
  next(random: Rng) {
    const white = noise(random);
    this.b0 = .99765 * this.b0 + white * .099046; this.b1 = .963 * this.b1 + white * .2965164; this.b2 = .57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * .1848) * .25;
  }
}

// ---------------------------------------------------------------- music

const nearest = <T extends {midi: number}>(bank: readonly T[], midi: number) => bank.reduce((best, note) => Math.abs(note.midi - midi) < Math.abs(best.midi - midi) ? note : best);

/** Salamander felt-piano: nearest sample, resampled ≤ 1.5 semitones, darkened by velocity. */
export function piano(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {length?: number; bright?: number} = {}) {
  const source = nearest(mix.piano, midi);
  const ratio = 2 ** ((midi - source.midi) / 12);
  const length = Math.min(options.length ?? 4, (source.data.length - 2) / ratio / 48_000);
  const out = buffer(length);
  const tone = new Svf(), felt = OnePole.lowpass(9000);
  const cutoff = 700 + 5200 * velocity * (options.bright ?? .6) + midi * 20;
  const releaseStart = out.length - samples(Math.min(.35, length * .3));
  for (let i = 0; i < out.length; i++) {
    const position = i * ratio, index = Math.floor(position), fraction = position - index;
    const sample = source.data[index] + (source.data[index + 1] - source.data[index]) * fraction;
    let value = felt.process(tone.process(sample, cutoff, .6));
    if (i > releaseStart) value *= .5 + .5 * Math.cos(Math.PI * (i - releaseStart) / (out.length - releaseStart));
    out[i] = value * (.35 + .65 * velocity);
  }
  mix.emit(time, route, out); mix.count('piano');
}

/**
 * A DX-style FM electric piano rendered as a bank every three semitones, so `piano()` and all the piano
 * writing play it unchanged: a 1:1 body whose index decays into a sine, plus a short metallic tine.
 */
export const electricPiano = (): PianoBank => Array.from({length: 22}, (_, i) => 33 + 3 * i).map(midi => {
  const hz = mtof(midi), data = new Float32Array(48_000 * 8), decay = 2.6 * 2 ** (-(midi - 60) / 30);
  const carrier = new Sine(), modulator = new Sine(), tine = new Sine(), strike = new Sine();
  for (let i = 0; i < data.length; i++) {
    const t = i / 48_000;
    const body = carrier.next(hz + modulator.next(hz) * hz * 1.4 * Math.exp(-t / .35));
    const bark = tine.next(hz * 4 + strike.next(Math.min(hz * 14, 18_000)) * hz * 3 * Math.exp(-t / .01)) * Math.exp(-t / .06);
    data[i] = (body * Math.exp(-t / decay) + bark * .18) * Math.min(1, t / .0015) * .11;
  }
  return {midi, data};
});

const layersOf = (mix: Mix, section: StringSection, midi: number) => {
  const bank = mix.strings[section];
  if (!bank?.length) throw new Error(`Missing "${section}" string samples (poc/sound-sources/vsco2-strings)`);
  const loud = nearest(bank.filter(note => note.dynamic === 'loud'), midi);
  const soft = bank.some(note => note.dynamic === 'soft') ? nearest(bank.filter(note => note.dynamic === 'soft'), midi) : loud;
  return {soft, loud};
};
// Loaders level sustains to -24 dBFS RMS (loud layer); this puts a mezzo string note beside a mezzo piano note.
const STRING_LOOP = [2.2, 4.6] as const, STRING_FADE = .35, STRING_GAIN = 1.4;
/** Linear-interpolated read that crossfades back into a mid-sustain loop, so a 6 s sample can hold any note length. */
const sustainAt = (data: Float32Array, position: number) => {
  const start = STRING_LOOP[0] * 48_000, end = Math.min(STRING_LOOP[1] * 48_000, data.length - 2), span = end - start, fade = STRING_FADE * 48_000;
  const read = (p: number) => { const i = Math.floor(p), f = p - i; return data[i] + (data[i + 1] - data[i]) * f; };
  if (span <= fade) return position < data.length - 1 ? read(position) : 0;
  let p = position;
  while (p >= end) p -= span;
  if (p < end - fade || position < end - fade) return read(p);
  const x = (p - (end - fade)) / fade;
  return read(p) * Math.cos(x * Math.PI / 2) + read(p - span) * Math.sin(x * Math.PI / 2);
};

/**
 * Sampled bowed note (VSCO-2): soft and loud layers crossfaded by the dynamic, which can swell across
 * the note. `offset` skips into the bow stroke so legato lines connect without re-articulating.
 */
export function bowed(mix: Mix, start: number, end: number, midi: number, route: Route, options: {
  section?: Exclude<StringSection, 'pizz'>; dynamics?: [number, number]; attack?: number; release?: number; offset?: number; level?: number; bright?: number;
} = {}) {
  const section = options.section ?? 'violin', [from, to] = options.dynamics ?? [.6, .6];
  const attack = options.attack ?? .08, release = options.release ?? .45, length = Math.max(.02, end - start);
  const {soft, loud} = layersOf(mix, section, midi);
  const out = buffer(length + release), offset = (options.offset ?? 0) * 48_000;
  const ratios = [soft, loud].map(note => 2 ** ((midi - note.midi) / 12));
  const tone = OnePole.lowpass(2500 + 9000 * (options.bright ?? .6));
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = clamp(t / length);
    const dynamic = clamp(from + (to - from) * progress * progress * (3 - 2 * progress));
    const blend = clamp((dynamic - .25) / .55);
    const value = sustainAt(soft.data, offset + i * ratios[0]) * Math.cos(blend * Math.PI / 2) + sustainAt(loud.data, offset + i * ratios[1]) * Math.sin(blend * Math.PI / 2);
    out[i] = tone.process(value) * gateEnv(t, attack, Math.max(0, length - attack), release) * (.3 + .7 * dynamic) * (options.level ?? 1) * STRING_GAIN;
  }
  mix.emit(start, route, out); mix.count(section);
}

/** Sampled violin pizzicato, pitched from the nearest string. */
export function pizz(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {length?: number} = {}) {
  const {loud} = layersOf(mix, 'pizz', midi), ratio = 2 ** ((midi - loud.midi) / 12);
  const out = buffer(Math.min(options.length ?? 1.2, (loud.data.length - 2) / ratio / 48_000)), tone = OnePole.lowpass(2200 + 6000 * velocity);
  for (let i = 0; i < out.length; i++) {
    const position = i * ratio, index = Math.floor(position), fraction = position - index;
    out[i] = tone.process(loud.data[index] + (loud.data[index + 1] - loud.data[index]) * fraction) * (.3 + .7 * velocity) * STRING_GAIN;
  }
  mix.emit(time, route, out); mix.count('pizz');
}

/** Warm analog pad: three detuned saws per note, slow filter bloom, wide stereo. */
export function pad(mix: Mix, start: number, end: number, notes: readonly number[], route: Route, options: {attack?: number; release?: number; cutoff?: [number, number]; level?: number; pump?: Pump} = {}) {
  const attack = options.attack ?? 1.2, release = options.release ?? 1.6;
  const duration = end - start + release;
  const left = buffer(duration), right = buffer(duration);
  const [openFrom, openTo] = options.cutoff ?? [500, 1800];
  notes.forEach((midi, noteIndex) => {
    const oscillators = [-9, 0, 8].map((cents, i) => ({saw: new Saw(mix.random()), hz: mtof(midi + cents / 100), pan: (i - 1) * .7 + (noteIndex % 2 ? .15 : -.15)}));
    const filterLeft = new Svf(), filterRight = new Svf();
    const hold = end - start - attack;
    for (let i = 0; i < left.length; i++) {
      const t = i / 48_000;
      const envelope = gateEnv(t, attack, Math.max(0, hold), release);
      if (envelope === 0 && t > attack) continue;
      const progress = clamp(t / Math.max(.1, end - start));
      const cutoff = openFrom + (openTo - openFrom) * Math.sin(progress * Math.PI / 2) + 120 * Math.sin(t * 1.3 + noteIndex);
      let l = 0, r = 0;
      for (const oscillator of oscillators) {
        const value = oscillator.saw.next(oscillator.hz);
        const [gl, gr] = panGains(oscillator.pan); l += value * gl; r += value * gr;
      }
      left[i] += filterLeft.process(l, cutoff, .8) * envelope;
      right[i] += filterRight.process(r, cutoff, .8) * envelope;
    }
  });
  const level = (options.level ?? 1) * .06 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { const g = level * pumpGain(options.pump, start + i / 48_000); left[i] *= g; right[i] *= g; }
  mix.emit(start, route, left, right); mix.count('pad');
}

/** Muted synth pluck — the agent "motor" and the Flow arpeggio. */
export function pluck(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number; bright?: number} = {}) {
  const decay = options.decay ?? .16, bright = options.bright ?? .5;
  const out = buffer(decay * 6 + .02);
  const a = new Saw(mix.random()), b = new Saw(mix.random()), filter = new Svf();
  const hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const envelope = pluckEnv(t, .002, decay);
    const cutoff = hz * 1.2 + (400 + 5200 * bright * velocity) * Math.exp(-t / (decay * .45));
    out[i] = filter.process((a.next(hz * 1.003) + b.next(hz * .997)) * .5, cutoff, 1.1) * envelope * velocity * .32;
  }
  mix.emit(time, route, out); mix.count('pluck');
}

/** Two-operator glass FM bell. `ratio` 3.5 is glassy, 2 is warmer and more vibraphone-like. */
export function bell(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number; ratio?: number; index?: number} = {}) {
  const decay = options.decay ?? 1.4, ratio = options.ratio ?? 3.5, index = options.index ?? 1.6;
  const out = buffer(decay * 5);
  const hz = mtof(midi);
  const carrier = new Sine(), modulator = new Sine(), partial = new Sine(), soften = OnePole.lowpass(9000);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const modulation = modulator.next(hz * ratio) * index * Math.exp(-t / (decay * .18)) * hz;
    const value = carrier.next(hz + modulation) + .22 * partial.next(hz * 2.756) * Math.exp(-t / (decay * .3));
    out[i] = soften.process(value) * pluckEnv(t, .0015, decay) * velocity * .16;
  }
  mix.emit(time, route, out); mix.count('bell');
}

/** Round sine bass with a touch of second harmonic; `glide` bends into the note. */
export function bass(mix: Mix, time: number, midi: number, duration: number, velocity: number, route: Route, options: {glide?: number; drive?: number} = {}) {
  const out = buffer(duration + .12);
  const hz = mtof(midi), osc = new Sine(), filter = OnePole.lowpass(900);
  const drive = options.drive ?? 1.4;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const bend = options.glide ? 2 ** (options.glide * Math.exp(-t / .03) / 12) : 1;
    const value = Math.tanh(osc.next(hz * bend) * drive) / Math.tanh(drive);
    out[i] = filter.process(value) * gateEnv(t, .006, Math.max(0, duration - .006), .1) * velocity * .34;
  }
  mix.emit(time, route, out); mix.count('bass');
}

/**
 * Bowed string section: four detuned saws per note, each with its own delayed vibrato, through a
 * body filter that opens with the dynamic. `dynamics` is the [start, end] level of a hairpin.
 */
export function strings(mix: Mix, start: number, end: number, notes: readonly number[], route: Route, options: {
  attack?: number; release?: number; level?: number; bright?: number; dynamics?: [number, number]; pump?: Pump;
} = {}) {
  const attack = options.attack ?? .8, release = options.release ?? 1.2, bright = options.bright ?? .5;
  const [from, to] = options.dynamics ?? [1, 1];
  const length = end - start, left = buffer(length + release), right = buffer(length + release);
  notes.forEach((midi, noteIndex) => {
    const players = [-11, -4, 5, 12].map((cents, i) => ({
      saw: new Saw(mix.random()), hz: mtof(midi + cents / 100), rate: 4.6 + mix.random() * 1.1, phase: mix.random() * 6.28,
      pan: (i - 1.5) * .45 + (noteIndex % 2 ? .12 : -.12),
    }));
    const bodyLeft = new Svf(), bodyRight = new Svf(), lowLeft = OnePole.lowpass(9000), lowRight = OnePole.lowpass(9000);
    for (let i = 0; i < left.length; i++) {
      const t = i / 48_000;
      const envelope = gateEnv(t, attack, Math.max(0, length - attack), release);
      if (envelope === 0 && t > attack) continue;
      const progress = clamp(t / Math.max(.1, length));
      const dynamic = from + (to - from) * (progress * progress * (3 - 2 * progress));
      const depth = 9 * clamp((t - .35) / .6);
      let l = 0, r = 0;
      for (const player of players) {
        const value = player.saw.next(player.hz * 2 ** (depth * Math.sin(2 * Math.PI * player.rate * t + player.phase) / 1200));
        const [gl, gr] = panGains(player.pan); l += value * gl; r += value * gr;
      }
      const cutoff = mtof(midi) * 2 + (600 + 3400 * bright) * (.35 + .65 * dynamic);
      const g = envelope * dynamic;
      left[i] += lowLeft.process(bodyLeft.process(l, cutoff, .7)) * g;
      right[i] += lowRight.process(bodyRight.process(r, cutoff, .7)) * g;
    }
  });
  const level = (options.level ?? 1) * .055 / Math.sqrt(notes.length);
  for (let i = 0; i < left.length; i++) { const g = level * pumpGain(options.pump, start + i / 48_000); left[i] *= g; right[i] *= g; }
  mix.emit(start, route, left, right); mix.count('strings');
}

/** Tuned timpani: inharmonic membrane partials, a slight pitch sag, and a felt mallet. */
export function timpani(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {decay?: number} = {}) {
  const decay = options.decay ?? 1.6, out = buffer(decay * 3), hz = mtof(midi), mallet = new Svf();
  const partials = [[1, 1, 1], [1.504, .55, .7], [1.742, .35, .5], [2, .22, .45], [2.245, .14, .35]].map(([ratio, gain, tau]) => ({osc: new Sine(), ratio, gain, tau}));
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, sag = 1 + .035 * Math.exp(-t / .05);
    let value = 0;
    for (const partial of partials) value += partial.osc.next(hz * partial.ratio * sag) * partial.gain * Math.exp(-t / (decay * partial.tau));
    mallet.process(noise(mix.random), 900 + 1400 * velocity, .8);
    out[i] = (Math.tanh(value * .9) + mallet.lp * Math.exp(-t / .012) * .8) * pluckEnv(t, .002, decay * 3) * velocity * .4;
  }
  mix.emit(time, route, out); mix.count('timpani');
}

/**
 * Clean electronic beep: sine, or additive square/triangle (band-limited under 9 kHz).
 * `glide` bends the pitch by that many semitones across the note.
 */
export function beep(mix: Mix, time: number, midi: number, velocity: number, route: Route, options: {
  length?: number; wave?: 'sine' | 'square' | 'triangle'; attack?: number; glide?: number;
} = {}) {
  const length = options.length ?? .07, attack = options.attack ?? .002, wave = options.wave ?? 'sine';
  const out = buffer(length + .02);
  const base = mtof(midi), harmonics = wave === 'sine' ? [1] : [1, 3, 5, 7, 9, 11, 13].filter(k => k * base * 2 ** ((options.glide ?? 0) / 12) < 9000);
  const oscillators = harmonics.map(() => new Sine()), soften = OnePole.lowpass(7000);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const hz = base * 2 ** ((options.glide ?? 0) * clamp(t / length) / 12);
    let value = 0;
    harmonics.forEach((k, index) => {
      const amplitude = wave === 'square' ? 1 / k : (index % 2 ? -1 : 1) / (k * k);
      value += oscillators[index].next(hz * k) * amplitude;
    });
    out[i] = soften.process(value) * gateEnv(t, attack, Math.max(0, length - attack - .012), .012) * velocity * (wave === 'square' ? .12 : .2);
  }
  mix.emit(time, route, out); mix.count('beep');
}

// ---------------------------------------------------------------- drums

export function kick(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.5), body = new Sine(), click = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const hz = 46 + 92 * Math.exp(-t / .028);
    const snap = click.process(noise(mix.random) * Math.exp(-t / .0025), 3200, .9);
    out[i] = (Math.tanh(body.next(hz) * 1.6) * Math.exp(-t / .19) + snap * .35) * velocity * .55;
  }
  mix.emit(time, route, out); mix.count('kick');
}

/** Soft layered clap/snap: three early bursts then a short band-passed tail. */
export function clap(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.3), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const bursts = [0, .009, .018].reduce((sum, offset) => sum + (t >= offset ? Math.exp(-(t - offset) / .004) : 0), 0);
    const envelope = bursts * .6 + Math.exp(-t / .07) * .55;
    filter.process(noise(mix.random), 1450, 1.1);
    out[i] = filter.bp * envelope * velocity * .6;
  }
  mix.emit(time, route, out); mix.count('clap');
}

export function hat(mix: Mix, time: number, velocity: number, route: Route, decay = .028) {
  const out = buffer(decay * 6), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    filter.process(noise(mix.random), 8200, .8);
    out[i] = filter.hp * pluckEnv(t, .0008, decay) * velocity * .22;
  }
  mix.emit(time, route, out); mix.count('hat');
}

export function shaker(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.09), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    filter.process(noise(mix.random), 6200, 1.4);
    out[i] = filter.bp * gateEnv(t, .012, .004, .06) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('shaker');
}

// ---------------------------------------------------------------- foley / motion

const WHOOSH_CAP = 2400, WHOOSH_GAIN = 1.7;

export type WhooshOptions = {
  from: number; to: number; level: number; q?: number; panFrom?: number; panTo?: number;
  /** 0..1: where the swell peaks inside the window. */
  peak?: number; air?: number; tone?: number;
};

/**
 * Air pass-by. Pink noise (decorrelated per ear) through a broad, gently resonant band-pass whose
 * centre rides the swell, over a low band that gives the move some mass. `from`/`to` are soft-capped
 * under 2.4 kHz and the hiss rolled off at 4.2 kHz: narrow white noise in the 2–5 kHz band, where
 * hearing is most sensitive, is what whistles.
 */
export function whoosh(mix: Mix, time: number, duration: number, route: Route, options: WhooshOptions) {
  const tail = .35, left = buffer(duration + tail), right = buffer(duration + tail);
  const peak = options.peak ?? .6, resonance = .7 + .35 * clamp(((options.q ?? 1.3) - .8) / 1.6);
  const ears = [0, 1].map(() => ({pink: new Pink(), sweep: new Svf(), mass: new Svf(), air: new Svf(), hiss: OnePole.lowpass(4200), rumble: new Svf()}));
  const body = new Sine(), soft = (hz: number) => hz * WHOOSH_CAP / (hz + WHOOSH_CAP);
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, progress = clamp(t / duration);
    const shaped = progress < peak ? Math.sin(progress / peak * Math.PI / 2) ** 2 : Math.cos((progress - peak) / (1 - peak) * Math.PI / 2) ** 1.4;
    const envelope = t > duration ? shaped * Math.exp(-(t - duration) / .09) : shaped;
    const sweep = progress < peak ? progress / peak : 1 - (progress - peak) / (1 - peak) * .35;
    const cutoff = soft(options.from * (options.to / options.from) ** clamp(sweep));
    const [a, b] = ears.map(ear => {
      const source = ear.pink.next(mix.random);
      ear.sweep.process(source, cutoff, resonance);
      ear.mass.process(source, clamp(cutoff * .35, 90, 300), .7);
      ear.air.process(source, Math.min(cutoff * 1.8, 3000), .7);
      ear.rumble.process(ear.sweep.bp + ear.mass.bp * .35 + ear.air.bp * (options.air ?? .2) * .35, 70, .7);
      return ear.hiss.process(ear.rumble.hp);
    });
    let mid = (a + b) * .5;
    const side = (a - b) * .4;
    if (options.tone) mid += body.next(mtof(options.tone) * (.94 + .12 * sweep)) * .12;
    const pan = (options.panFrom ?? 0) + ((options.panTo ?? 0) - (options.panFrom ?? 0)) * progress;
    const [gl, gr] = panGains(pan), g = envelope * options.level * WHOOSH_GAIN;
    left[i] = (mid + side) * gl * Math.SQRT2 * g; right[i] = (mid - side) * gr * Math.SQRT2 * g;
  }
  mix.emit(time, route, left, right); mix.count('whoosh');
}

/** Riser that ends exactly at `end`: dark noise opening upward under a detuned saw, all under ~3 kHz. */
export function riser(mix: Mix, start: number, end: number, route: Route, options: {level: number; fromMidi: number; toMidi: number}) {
  const duration = end - start;
  // Durations derive from cue gaps; a retime can invert them, and a negative buffer length throws.
  if (duration <= 0) return;
  const left = buffer(duration), right = buffer(duration);
  const ears = [0, 1].map(() => ({pink: new Pink(), filter: new Svf(), hiss: OnePole.lowpass(4200)}));
  const sawA = new Saw(), sawB = new Saw(), tone = new Svf();
  for (let i = 0; i < left.length; i++) {
    const t = i / 48_000, progress = t / duration;
    const envelope = progress ** 2.4 * (i > left.length - 240 ? (left.length - i) / 240 : 1);
    const cutoff = 300 * 8 ** progress;
    const [a, b] = ears.map(ear => { ear.filter.process(ear.pink.next(mix.random), cutoff, .9); return ear.hiss.process(ear.filter.bp); });
    const pitch = mtof(options.fromMidi + (options.toMidi - options.fromMidi) * progress ** 1.6);
    const synth = tone.process(sawA.next(pitch * 1.004) - sawB.next(pitch * .996), 500 + 2400 * progress, .9) * .22;
    left[i] = (a + synth) * envelope * options.level; right[i] = (b + synth) * envelope * options.level;
  }
  mix.emit(start, route, left, right); mix.count('riser');
}

/** Reversed bell chord that blooms into `end` — the "breath in" before a downbeat. */
export function reverseSwell(mix: Mix, end: number, duration: number, notes: readonly number[], route: Route) {
  if (duration <= 0) return;
  const scratch = new Mix(samples(duration + .01), mix.random, mix.piano, mix.strings);
  notes.forEach((midi, i) => bell(scratch, 0, midi, .8 - i * .06, {bus: 'music', pan: (i % 2 ? .45 : -.45)}, {decay: duration * .6, ratio: 2, index: .9}));
  const {l, r} = scratch.music;
  const left = buffer(duration), right = buffer(duration);
  for (let i = 0; i < left.length; i++) {
    const source = left.length - 1 - i;
    const fadeIn = clamp(i / (left.length * .25));
    left[i] = l[source] * fadeIn; right[i] = r[source] * fadeIn;
  }
  mix.emit(end - duration, route, left, right); mix.count('reverseSwell');
}

/** Sub drop + low noise bloom. The "floor" under a reveal. */
export function impact(mix: Mix, time: number, level: number, route: Route) {
  const out = buffer(2.4), sub = new Sine(), rumble = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const hz = 34 + 40 * Math.exp(-t / .18);
    rumble.process(noise(mix.random), 180 + 900 * Math.exp(-t / .08), .7);
    out[i] = (Math.tanh(sub.next(hz) * 1.3) * Math.exp(-t / .7) * .8 + rumble.lp * Math.exp(-t / .35) * .5) * level;
  }
  mix.emit(time, route, out); mix.count('impact');
}

/** Tuned micro-tick: counters, ratchets, log lines. */
export function tick(mix: Mix, time: number, midi: number, velocity: number, route: Route, decay = .012) {
  const out = buffer(decay * 6 + .004), osc = new Sine(), click = new Svf();
  const hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    click.process(noise(mix.random), 5200, 1);
    out[i] = (osc.next(hz) * pluckEnv(t, .0006, decay) * .7 + click.bp * Math.exp(-t / .0018) * .8) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('tick');
}

/** Water-droplet pop: rising sine chirp. Issue triangles and badges. */
export function pop(mix: Mix, time: number, midi: number, velocity: number, route: Route) {
  const out = buffer(.14), osc = new Sine();
  const hz = mtof(midi);
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    const bend = .72 + .34 * (1 - Math.exp(-t / .011));
    out[i] = osc.next(hz * bend) * pluckEnv(t, .0012, .035) * velocity * .3;
  }
  mix.emit(time, route, out); mix.count('pop');
}

/** Dull, satisfying close: wooden body + short felt noise. Doors and the agent window. */
export function thock(mix: Mix, time: number, velocity: number, route: Route, pitch = 1) {
  const out = buffer(.3), body = new Sine(), knock = new Sine(), felt = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    felt.process(noise(mix.random), 900 * pitch, 1.2);
    out[i] = (body.next((64 + 70 * Math.exp(-t / .02)) * pitch) * Math.exp(-t / .07)
      + knock.next(430 * pitch) * Math.exp(-t / .012) * .35 + felt.bp * Math.exp(-t / .01) * .9) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('thock');
}

/** Low-profile mechanical key. Randomized per stroke so typing never machine-guns. */
export function keyClick(mix: Mix, time: number, velocity: number, route: Route) {
  const out = buffer(.06), cap = new Svf(), body = new Sine();
  const tone = 2600 + mix.random() * 1600, thump = 160 + mix.random() * 60;
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    cap.process(noise(mix.random), tone, 1.6);
    out[i] = (cap.bp * Math.exp(-t / .0045) + body.next(thump) * Math.exp(-t / .012) * .4) * velocity * .42;
  }
  mix.emit(time, route, out); mix.count('keyClick');
}

/** Air puff: short low-passed noise breath (clouds, smoke). */
export function puff(mix: Mix, time: number, velocity: number, route: Route, hz = 900) {
  const out = buffer(.5), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000;
    filter.process(noise(mix.random), hz * (1 + .6 * Math.exp(-t / .05)), .7);
    out[i] = filter.lp * gateEnv(t, .025, .02, .35) * velocity * .5;
  }
  mix.emit(time, route, out); mix.count('puff');
}

/** Descending drain: gliding tone with tremolo — money running out. */
export function drain(mix: Mix, time: number, duration: number, route: Route, options: {fromMidi: number; toMidi: number; level: number}) {
  const out = buffer(duration + .3), osc = new Sine(), overtone = new Sine(), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = clamp(t / duration);
    const midi = options.fromMidi + (options.toMidi - options.fromMidi) * (1 - (1 - progress) ** 1.7);
    const hz = mtof(midi);
    const tremolo = .75 + .25 * Math.sin(2 * Math.PI * (7 - 4 * progress) * t);
    const value = osc.next(hz) + .3 * overtone.next(hz * 2.01);
    out[i] = filter.process(value, 2400 - 1600 * progress, .7) * gateEnv(t, .12, Math.max(0, duration - .12), .3) * tremolo * options.level;
  }
  mix.emit(time, route, out); mix.count('drain');
}

/** Power-down: a filtered saw whose pitch falls away — the agent failing. */
export function dive(mix: Mix, time: number, duration: number, route: Route, options: {fromMidi: number; toMidi: number; level: number}) {
  const out = buffer(duration + .05), saw = new Saw(), sub = new Sine(), filter = new Svf();
  for (let i = 0; i < out.length; i++) {
    const t = i / 48_000, progress = clamp(t / duration);
    const hz = mtof(options.fromMidi + (options.toMidi - options.fromMidi) * progress ** .7);
    const value = filter.process(saw.next(hz), 300 + 2600 * (1 - progress) ** 2, 1.2) * .6 + sub.next(hz / 2) * .5;
    out[i] = value * gateEnv(t, .004, duration * .25, duration * .75) * options.level;
  }
  mix.emit(time, route, out); mix.count('dive');
}

/** Gentle highlighter swipe: a soft sweep that brightens across the phrase. */
export function marker(mix: Mix, time: number, duration: number, route: Route, level = .5) {
  whoosh(mix, time, duration, route, {from: 900, to: 2400, level, q: 1.2, peak: .35, air: .5, panFrom: -.3, panTo: .3});
}
