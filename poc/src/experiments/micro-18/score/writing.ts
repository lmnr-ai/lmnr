import {bowed, piano, type Mix, type Route, type StringSection} from './voices';

/** A piano voicing: a bass note for the left hand plus the tones a figure walks through, low → high. */
export type Chord = {bass: number; tones: readonly number[]};
export type Progression = readonly (readonly [beat: number, chord: Chord])[];

/**
 * Build a progression that mixes fixed offsets with picture-derived anchors. Listing order is intent:
 * an entry that starts at or before an earlier-listed one overrides it, so a retimed anchor cuts the
 * chords ahead of it short instead of leaving the list unsorted.
 */
export function progression(...entries: (readonly [beat: number, chord: Chord])[]): Progression {
  const kept: (readonly [number, Chord])[] = [];
  for (let i = entries.length - 1; i >= 0; i--) if (!kept.length || entries[i][0] < kept[0][0] - 1e-9) kept.unshift(entries[i]);
  return kept;
}

/** The chord sounding at `beat`: the latest entry starting at or before it (the first one before the progression starts). */
export const chordAt = (progression: Progression, beat: number) => {
  let current = progression[0];
  for (const entry of progression) if (entry[0] <= beat + 1e-9 && (current[0] > beat + 1e-9 || entry[0] >= current[0])) current = entry;
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

/**
 * A bowed line as [beat, midi, length-in-beats, dynamic?] events. Notes that start where the previous
 * one ends are slurred: they enter past the next sample's bow change and overlap the release, so the line never re-articulates.
 */
export function legato(mix: Mix, grid: (beat: number) => number, notes: readonly (readonly [number, number, number, (number | [number, number])?])[], route: Route,
  options: {section?: Exclude<StringSection, 'pizz'>; dynamic?: number; bright?: number; level?: number; release?: number} = {}) {
  notes.forEach(([beat, midi, length, dynamic], i) => {
    const slurred = i > 0 && Math.abs(notes[i - 1][0] + notes[i - 1][2] - beat) < 1e-6;
    const slurs = i + 1 < notes.length && Math.abs(beat + length - notes[i + 1][0]) < 1e-6;
    const level = dynamic ?? options.dynamic ?? .6, dynamics: [number, number] = typeof level === 'number' ? [level, level * .92] : level;
    bowed(mix, grid(beat), grid(beat + length) + (slurs ? .05 : 0), midi, route, {
      section: options.section, dynamics, attack: slurred ? .06 : .1, release: slurs ? .09 : options.release ?? .6, offset: slurred ? .12 : 0, bright: options.bright, level: options.level,
    });
  });
}

/**
 * A budget running out, written as a line: notes slow from ~12/s to ~3/s while a target pitch falls
 * from `top` by `fall`; each note is the nearest tone of `tonesAt(time)` at or below the target.
 */
export function drainLine(start: number, duration: number, top: number, fall: number, tonesAt: (time: number) => readonly number[]) {
  const notes: {time: number; midi: number; progress: number}[] = [];
  for (let at = 0; at < duration - .1; at += .08 + .3 * (at / duration) ** 2) {
    const progress = at / duration, classes = tonesAt(start + at).map(midi => midi % 12);
    let midi = Math.floor(top - fall * progress ** 1.3);
    while (!classes.includes(midi % 12)) midi--;
    notes.push({time: start + at, midi, progress});
  }
  return notes;
}
