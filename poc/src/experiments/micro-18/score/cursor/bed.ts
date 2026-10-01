import {OnePole, Sine, Svf, clamp, mtof, panGains, samples} from '../dsp';
import type {Mix, Route} from '../voices';

/*
 * One continuous bed for the whole film (LAM-2317 v2). Every note owns one oscillator bank for the
 * entire render, so notes shared between chords never re-attack: a chord change only crossfades the
 * notes that actually move. v1 enveloped each chord separately, which left holes at the seams.
 */

/** A bed keyframe. Unset fields carry over from the previous key. */
export type BedKey = {
  at: number;
  notes?: readonly number[];
  /** Equal-power crossfade time for notes entering or leaving (s). */
  fade?: number;
  /** Glide time for cutoff and level (s); defaults to `fade`. */
  glide?: number;
  cutoff?: number;
  level?: number;
  /** Tape pitch drift in semitones, reached over `bendTime`. */
  bend?: number;
  bendTime?: number;
  breath?: number;
};

type Segment = {at: number; duration: number; from: number; to: number};

/** A piecewise-smooth control signal; `at` must be called with non-decreasing times. */
class Track {
  private index = 0;
  constructor(private readonly segments: Segment[], private readonly power = false) {}
  static build(keys: {at: number; value: number; time: number}[], initial: number, power = false) {
    const segments: Segment[] = [];
    let value = initial;
    for (const [k, key] of keys.entries()) {
      const next = keys[k + 1]?.at ?? Infinity;
      const segment = {at: key.at, duration: Math.max(1e-3, key.time), from: value, to: key.value};
      segments.push(segment);
      value = new Track([segment], power).at(Math.min(next, key.at + segment.duration));
    }
    return new Track(segments, power);
  }
  at(t: number) {
    while (this.index + 1 < this.segments.length && this.segments[this.index + 1].at <= t) this.index++;
    const segment = this.segments[this.index];
    if (!segment || t < segment.at) return segment ? segment.from : 0;
    const x = clamp((t - segment.at) / segment.duration), up = segment.to > segment.from;
    const shape = this.power ? (up ? Math.sin(x * Math.PI / 2) : 1 - Math.cos(x * Math.PI / 2)) : .5 - .5 * Math.cos(x * Math.PI);
    return segment.from + (segment.to - segment.from) * shape;
  }
}

type Resolved = Required<Omit<BedKey, 'glide'>> & {glide: number};

const resolve = (keys: readonly BedKey[]): Resolved[] => {
  let state: Resolved = {at: 0, notes: [], fade: 1.5, glide: 1.5, cutoff: 900, level: 1, bend: 0, bendTime: .5, breath: .18};
  return keys.map(key => (state = {...state, ...key, glide: key.glide ?? key.fade ?? state.fade}));
};

const wow = (t: number, depth = 4) => depth * Math.sin(2 * Math.PI * .31 * t + 1.3) + .6 * Math.sin(2 * Math.PI * 5.1 * t);

/** The warm tape organ of `tapePad` (two detuned additive voices per note), held across the whole film. */
export function bed(mix: Mix, keys: readonly BedKey[], route: Route) {
  const resolved = resolve(keys), ids = [...new Set(resolved.flatMap(key => key.notes))].sort((a, b) => a - b);
  const control = (pick: (key: Resolved) => number, time: (key: Resolved) => number, initial: number) =>
    Track.build(resolved.map(key => ({at: key.at, value: pick(key), time: time(key)})), initial);
  const cutoff = control(key => key.cutoff, key => key.glide, resolved[0].cutoff);
  // .12/√n, as in tapePad: thicker chords play each note softer.
  const level = control(key => key.level * .12 / Math.sqrt(Math.max(1, key.notes.length)), key => key.glide, 0);
  const bend = control(key => key.bend, key => key.bendTime, 0), breath = control(key => key.breath, key => key.glide, .18);
  const partials = [1, 2, 3, 4, 5, 6].map(k => k ** -1.6);
  const notes = ids.map((midi, index) => ({
    hz: mtof(midi),
    gain: Track.build(resolved.map(key => ({at: key.at, value: key.notes.includes(midi) ? 1 : 0, time: key.fade})), 0, true),
    voices: [-5, 5].map((cents, v) => ({cents, pan: panGains((v ? .55 : -.55) + (index % 2 ? .1 : -.1)), oscillators: partials.map(() => new Sine(mix.random()))})),
  }));
  const start = samples(resolved[0].at), length = mix.length - start;
  const left = new Float32Array(length), right = new Float32Array(length), filters = [new Svf(), new Svf()];
  for (let i = 0; i < length; i++) {
    const t = resolved[0].at + i / 48_000, drift = bend.at(t), sway = wow(t);
    let l = 0, r = 0;
    for (const note of notes) {
      const g = note.gain.at(t);
      if (g < 1e-4) continue;
      for (const voice of note.voices) {
        const f = note.hz * 2 ** ((drift + (voice.cents + sway) / 100) / 12);
        let value = 0;
        for (let k = 0; k < 6; k++) value += voice.oscillators[k].next(f * (k + 1)) * partials[k];
        l += value * voice.pan[0] * g; r += value * voice.pan[1] * g;
      }
    }
    const hz = cutoff.at(t), swell = 1 - breath.at(t) * (.5 - .5 * Math.cos(2 * Math.PI * .54 * t)), gain = level.at(t) * swell;
    left[i] = filters[0].process(l, hz, .6) * gain; right[i] = filters[1].process(r, hz, .6) * gain;
  }
  mix.emit(resolved[0].at, route, left, right); mix.count('bed');
}

/** Bass keyframe: `midi` null is silence. Notes crossfade over `fade`, so the line never drops out between chords. */
export type BassKey = {at: number; midi: number | null; fade?: number; level?: number};

/** The held sine bass of `sub` as one continuous line. */
export function bassLine(mix: Mix, keys: readonly BassKey[], route: Route) {
  const ids = [...new Set(keys.flatMap(key => key.midi === null ? [] : [key.midi]))];
  const level = Track.build(keys.map(key => ({at: key.at, value: key.level ?? 1, time: key.fade ?? .5})), keys[0].level ?? 1);
  const notes = ids.map(midi => ({
    hz: mtof(midi), osc: new Sine(), octave: new Sine(),
    gain: Track.build(keys.map(key => ({at: key.at, value: key.midi === midi ? 1 : 0, time: key.fade ?? .5})), 0, true),
  }));
  const start = samples(keys[0].at), length = mix.length - start, out = new Float32Array(length), soften = OnePole.lowpass(420);
  for (let i = 0; i < length; i++) {
    const t = keys[0].at + i / 48_000, drift = 2 ** (wow(t, 2) / 1200);
    let value = 0;
    for (const note of notes) {
      const g = note.gain.at(t);
      if (g < 1e-4) continue;
      const f = note.hz * drift;
      value += Math.tanh((note.osc.next(f) + .22 * note.octave.next(2 * f)) * 1.2) / Math.tanh(1.2) * g;
    }
    out[i] = soften.process(value) * level.at(t) * .12;
  }
  mix.emit(keys[0].at, route, out); mix.count('bassLine');
}
