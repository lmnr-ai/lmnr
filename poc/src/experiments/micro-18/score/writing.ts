import {piano, type Mix, type Route} from './voices';

/** A piano voicing: a bass note for the left hand plus the tones a figure walks through, low → high. */
export type Chord = {bass: number; tones: readonly number[]};
export type Progression = readonly (readonly [beat: number, chord: Chord])[];

export const chordAt = (progression: Progression, beat: number) => {
  let current = progression[0];
  for (const entry of progression) if (beat >= entry[0] - 1e-9) current = entry;
  return current;
};

/** Human hands: a few ms of timing drift and a little velocity spread. */
export const humanize = (mix: Mix, time: number, velocity: number) =>
  [time + (mix.random() - .5) * .008, velocity * (.93 + mix.random() * .14)] as const;

/** A chord spread low → high like a rolled piano chord, panned across the keyboard. */
export function rolled(mix: Mix, time: number, notes: readonly number[], velocity: number, route: Route,
  options: {length?: number; bright?: number; spread?: number} = {}) {
  notes.forEach((midi, i) => {
    const pan = notes.length > 1 ? -.35 + .7 * i / (notes.length - 1) : 0;
    piano(mix, time + i * (options.spread ?? .018), midi, velocity * (1 - i * .025), {...route, pan}, options);
  });
}

/**
 * Broken-chord figure (Alberti, Bach prelude, Glass ostinato — the pattern decides). Each step plays
 * `tones[pattern[k]]`, counting k from the start of the current chord; the left hand takes the bass on chord changes.
 */
export function figure(mix: Mix, grid: (beat: number) => number, from: number, to: number, progression: Progression, options: {
  step: number; pattern: readonly number[]; velocity: (beat: number) => number; route: Route;
  length?: number; bright?: number; bass?: {velocity: number; length: number; octave?: boolean};
}) {
  const first = Math.ceil(from / options.step - 1e-9);
  for (let n = first; n * options.step < to - 1e-9; n++) {
    const beat = n * options.step;
    const [start, chord] = chordAt(progression, beat);
    const k = Math.round((beat - Math.max(start, from)) / options.step);
    if (options.bass && (k === 0 || n === first)) {
      const [time, velocity] = humanize(mix, grid(beat), options.bass.velocity);
      piano(mix, time, chord.bass, velocity, {...options.route, pan: -.25}, {length: options.bass.length, bright: options.bright});
      if (options.bass.octave) piano(mix, time + .004, chord.bass + 12, velocity * .75, {...options.route, pan: -.2}, {length: options.bass.length, bright: options.bright});
    }
    const midi = chord.tones[options.pattern[k % options.pattern.length] % chord.tones.length];
    const [time, velocity] = humanize(mix, grid(beat), options.velocity(beat) * (k % 2 ? .86 : 1));
    piano(mix, time, midi, velocity, {...options.route, pan: -.2 + .4 * (midi - 48) / 36}, {length: options.length ?? options.step * 1.8, bright: options.bright});
  }
}

/** A melody as [beat, midi, length-in-beats, velocity?] events, optionally doubled at the octave below. */
export function melody(mix: Mix, grid: (beat: number) => number, notes: readonly (readonly [number, number, number, number?])[], route: Route,
  options: {velocity?: number; octave?: boolean; bright?: number; sustain?: number} = {}) {
  for (const [beat, midi, length, velocity] of notes) {
    const [time, v] = humanize(mix, grid(beat), velocity ?? options.velocity ?? .5);
    const hold = {length: length * .5 * (options.sustain ?? 1.6) + .3, bright: options.bright};
    piano(mix, time, midi, v, route, hold);
    if (options.octave) piano(mix, time + .006, midi - 12, v * .7, {...route, pan: (route.pan ?? 0) - .15}, hold);
  }
}
