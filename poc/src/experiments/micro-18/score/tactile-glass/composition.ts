import {BEAT, type ScoreCues} from '../cues';
import {bass, bell, clap, hat, kick, pad, piano, pluck, reverseSwell, riser, shaker, type Mix, type Route} from '../voices';

/*
 * "Tactile Glass" — D major, 120 BPM. Each chapter is laid out in beats from
 * its own start; from Cost onward the chapters share one grid. The four-note Laminar motif
 * (D–E–F♯–A) is hinted at the Ultimate 2 zoom-out, sung at the Flow-1 reveal
 * and resolved as the logo sting.
 */

const PIANO: Route = {bus: 'music', hall: .38, delay: .06};
const PAD: Route = {bus: 'music', hall: .32};
const PLUCK: Route = {bus: 'music', hall: .1, delay: .16};
const BELL: Route = {bus: 'music', hall: .5, delay: .22};
const DRUM: Route = {bus: 'music', room: .12};
const LOW: Route = {bus: 'music', hall: .04};

const CHORD = {
  Dmaj9: [50, 57, 61, 64, 66], Bm11: [47, 54, 57, 62, 64], Gmaj9: [43, 50, 54, 57, 61], Em9: [52, 55, 59, 62, 66],
  A13sus: [45, 52, 55, 59, 62], A: [45, 52, 57, 61, 64], G6: [43, 50, 55, 59, 64], Fsm7: [42, 49, 54, 57, 64],
} as const;
const ROOT = {D: 38, B: 35, G: 43, E: 40, A: 45, Fs: 42} as const;
/** Chord tones for the 16th-note "agent motor" arpeggio, low → high. */
const ARP = {
  D: [62, 69, 74, 76, 78, 81], Bm: [59, 66, 71, 74, 78, 83], G: [55, 62, 67, 71, 74, 78], A: [57, 64, 69, 73, 76, 81],
  Em: [59, 64, 67, 71, 74, 79],
} as const;
const MOTOR_SHAPE = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 2, 0, 1, 3];

const beats = (start: number) => (beat: number) => start + beat * BEAT;

function motor(mix: Mix, time: (beat: number) => number, from: number, to: number, harmony: (beat: number) => readonly number[], velocity: (beat: number) => number, bright = .5) {
  for (let step = Math.ceil(from * 4); step < to * 4; step++) {
    const beat = step / 4;
    const notes = harmony(beat);
    const accent = step % 4 === 0 ? 1 : step % 2 === 0 ? .8 : .62;
    pluck(mix, time(beat), notes[MOTOR_SHAPE[step % 16] % notes.length], velocity(beat) * accent, {...PLUCK, pan: step % 2 ? .22 : -.22}, {decay: .12, bright});
  }
}

function groove(mix: Mix, time: (beat: number) => number, from: number, to: number, options: {clap?: boolean; level?: number; kick?: boolean} = {}) {
  const level = options.level ?? 1;
  for (let beat = from; beat < to; beat++) {
    if (options.kick !== false) kick(mix, time(beat), .72 * level, DRUM);
    if (options.clap !== false && (beat - from) % 2 === 1) clap(mix, time(beat), .5 * level, {...DRUM, room: .3, pan: .06});
    hat(mix, time(beat + .5), .5 * level, {...DRUM, pan: .3}, .035);
    for (const sixteenth of [.25, .75]) shaker(mix, time(beat + sixteenth), (sixteenth === .75 ? .5 : .36) * level, {...DRUM, pan: -.35});
  }
}

function eighthBass(mix: Mix, time: (beat: number) => number, from: number, to: number, root: (beat: number) => number, velocity = .75) {
  for (let beat = from; beat < to; beat += .5) {
    const up = (beat * 2) % 2 === 1;
    bass(mix, time(beat), root(beat) + (up ? 12 : 0), .2, velocity * (up ? .55 : 1), LOW, {glide: up ? 0 : -1});
  }
}

const pick = <T>(table: readonly [number, T][], beat: number) => [...table].reverse().find(([start]) => beat >= start)![1];

export function composeScore(mix: Mix, cues: ScoreCues) {
  ultimate2(mix, cues);
  cost(mix, cues);
  flow(mix, cues);
  issuesAndLogo(mix, cues);
}

function ultimate2(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, b = beats(cues.chapter.ultimate2.start);
  // A lone glass note as the agent appears; the room opens slowly beneath it.
  bell(mix, u2.agentEnter + .02, 86, .5, {...BELL, pan: .1}, {decay: 1.8, ratio: 2, index: .8});
  pad(mix, 0, u2.failure, CHORD.Dmaj9, PAD, {attack: 2.4, release: 1.2, cutoff: [260, 1100], level: .8});
  piano(mix, b(1), 50, .35, {...PIANO, pan: -.2}, {length: 3});
  piano(mix, b(1), 57, .3, {...PIANO, pan: .2}, {length: 3});

  // The stream: every block that flies past is a 16th of the agent motor.
  const streamEnd = u2.failure;
  const harmony = (beat: number) => beat < 6 ? ARP.D : beat < 8 ? ARP.Bm : ARP.G;
  const rampIn = (beat: number) => Math.min(1, .45 + (b(beat) - u2.stream.at) / .9) * .8;
  motor(mix, b, 4, (streamEnd - b(0)) / BEAT, harmony, rampIn, .55);
  for (const [beat, root] of [[4, ROOT.D], [6, ROOT.B], [8, ROOT.G]] as const) bass(mix, b(beat), root, beat === 8 ? .6 : 1, .55, LOW);
  for (let beat = 5; b(beat + .5) < streamEnd; beat++) hat(mix, b(beat + .5), .35, {...DRUM, pan: .3});

  // After the failure: suspended, darker, curious — "the trace can tell you why".
  pad(mix, u2.failure, u2.backtrack.at + .4, CHORD.Bm11, PAD, {attack: .6, release: 1.4, cutoff: [300, 700], level: .7});
  pad(mix, u2.backtrack.at, u2.insights, CHORD.Gmaj9, PAD, {attack: 1.2, release: 1.2, cutoff: [400, 1000], level: .75});
  bass(mix, u2.backtrack.at, ROOT.G - 12, 2.6, .35, LOW);
  // The three drawers lift in rising Lydian steps.
  u2.drawers.forEach((time, i) => piano(mix, time, [66, 69, 73][i], .5 + i * .06, {...PIANO, pan: -.25 + i * .25}, {length: 2.5}));

  // The zoom-out to thousands of traces: the motif, half-spoken.
  pad(mix, u2.insights, u2.cloudIn.at + .6, CHORD.Em9, PAD, {attack: 1.4, release: 1.2, cutoff: [500, 1900], level: .8});
  pad(mix, u2.cloudIn.at, u2.ifOnly + .3, CHORD.A13sus, PAD, {attack: 1, release: 1.4, cutoff: [700, 1500], level: .7});
  bass(mix, u2.insights, ROOT.E - 12, 3, .4, LOW);
  bass(mix, u2.cloudIn.at, ROOT.A - 12, 1.8, .38, LOW);
  const motifStart = b(Math.ceil((u2.zoom.at - b(0)) / BEAT));
  [[0, 74], [1, 76], [2, 78], [4, 81]].forEach(([beat, midi]) => piano(mix, motifStart + beat * BEAT, midi, .5, {...PIANO, pan: .15}, {length: 3}));

  // "If only someone could read them all." — an open question: no third, one glass overtone.
  piano(mix, u2.ifOnly, 43, .38, {...PIANO, pan: -.2}, {length: 3});
  piano(mix, u2.ifOnly, 62, .33, PIANO, {length: 3});
  piano(mix, u2.ifOnly + .02, 69, .36, {...PIANO, pan: .2}, {length: 3});
  bell(mix, u2.ifOnly + .25, 88, .32, {...BELL, pan: .3}, {decay: 2.2, ratio: 2, index: .6});
  pad(mix, u2.ifOnly, cues.cost.cloudOut.at + .4, CHORD.G6, PAD, {attack: .6, release: 1.6, cutoff: [350, 900], level: .7});
}

function cost(mix: Mix, cues: ScoreCues) {
  const c = cues.cost, b = beats(cues.chapter.cost.start);
  // Cheap LLMs: light, bouncy, a little too pleased with itself.
  const riffEnd = c.thinkingDrop.at;
  const riff = [67, 71, 74, 71, 76, 74, 71, 74, 69, 73, 76, 73, 78, 76, 73, 76];
  for (let step = 2; b(step / 2) < riffEnd - .02; step++) {
    const beat = step / 2;
    bell(mix, b(beat), riff[step % 16], step % 2 ? .45 : .6, {...BELL, hall: .18, delay: .1, pan: step % 2 ? .3 : -.1}, {decay: .22, ratio: 4, index: .9});
    if (step % 2 === 0) bass(mix, b(beat), step % 8 < 4 ? ROOT.G : ROOT.A, .16, .55, LOW);
    shaker(mix, b(beat + .25), .3, {...DRUM, pan: -.3});
  }
  pad(mix, b(1), riffEnd, CHORD.G6, PAD, {attack: .5, release: .5, cutoff: [900, 1600], level: .45});
  // "…but fail to find crucial issues": the riff trips on three dull notes.
  [71, 67, 64].forEach((midi, i) => pluck(mix, c.thinkingDrop.at + .2 + i * .07, midi, .7 - i * .08, {...PLUCK, pan: -.2 + i * .2}, {decay: .22, bright: .12}));
  pad(mix, c.thinkingDrop.at + .2, c.cameraToBash.at + .6, CHORD.Em9, PAD, {attack: .8, release: 1, cutoff: [300, 600], level: .6});
  bass(mix, c.thinkingDrop.at + .41, ROOT.E - 12, 1.2, .45, LOW);

  // More powerful LLMs: the floor drops. A slow B-minor pulse, deep and deliberate.
  const heavyFrom = Math.ceil((c.cameraToBash.at + c.cameraToBash.duration * .5 - b(0)) / BEAT);
  const heavyTo = Math.round((c.cameraToBudget.at - b(0)) / BEAT);
  pad(mix, b(heavyFrom), b(heavyTo) + .6, CHORD.Bm11, PAD, {attack: 1, release: 1.2, cutoff: [250, 800], level: .9});
  for (let beat = heavyFrom; beat < heavyTo; beat++) {
    if ((beat - heavyFrom) % 2 === 0) kick(mix, b(beat), .55, {...DRUM, room: .25});
    piano(mix, b(beat), [47, 54, 59, 54][(beat - heavyFrom) % 4], .38, {...PIANO, pan: -.1}, {length: 1.5, bright: .35});
  }
  eighthBass(mix, b, heavyFrom, heavyTo, () => ROOT.B - 12, .5);

  // The budget: warm for a moment, then it drains into a cold, empty chord.
  pad(mix, b(heavyTo), c.depletion.at + .4, CHORD.Gmaj9, PAD, {attack: .8, release: 1, cutoff: [500, 1200], level: .75});
  bass(mix, b(heavyTo), ROOT.G - 12, c.depletion.at - b(heavyTo), .4, LOW);
  pad(mix, c.depletion.at, cues.flow.reveal - .95, CHORD.Fsm7, PAD, {attack: 1.4, release: .8, cutoff: [900, 260], level: .7});
  bass(mix, c.depletion.at, ROOT.Fs - 12, 2.4, .35, LOW);
  piano(mix, c.depletion.at + c.depletion.duration, 42, .32, {...PIANO, pan: -.15}, {length: 2.2, bright: .3});
  piano(mix, c.depletion.at + c.depletion.duration + .02, 49, .28, {...PIANO, pan: .15}, {length: 2.2, bright: .3});

  // Breathe in: riser and reversed glass that suck out just before the title lands.
  const reveal = cues.flow.reveal;
  riser(mix, reveal - 2.1, reveal - .3, {bus: 'music', hall: .25}, {level: .07, fromMidi: 45, toMidi: 69});
  reverseSwell(mix, reveal, 1.3, [74, 78, 81, 86], {bus: 'music', hall: .2});
}

function flow(mix: Mix, cues: ScoreCues) {
  const f = cues.flow, start = cues.chapter.flow.start, b = beats(start);
  const revealBeat = (f.reveal - start) / BEAT;
  // The drop: Flow-1. Wide D major 9, the motif sung in full over it.
  pad(mix, f.reveal, b(7), CHORD.Dmaj9.map(n => n + 12), PAD, {attack: .05, release: 1.6, cutoff: [2600, 1500], level: .8});
  pad(mix, f.reveal, b(7), CHORD.Dmaj9, PAD, {attack: .05, release: 1.6, cutoff: [1500, 900], level: .8});
  [38, 50, 57, 64, 66, 69].forEach((midi, i) => piano(mix, f.reveal + i * .012, midi, .72, {...PIANO, pan: -.4 + i * .16}, {length: 4.2}));
  bass(mix, f.reveal, ROOT.D - 12, 3, .45, LOW);
  bell(mix, f.reveal, 86, .55, {...BELL, pan: -.35}, {decay: 2.6, ratio: 2, index: .7});
  bell(mix, f.reveal + .03, 93, .4, {...BELL, pan: .35}, {decay: 2.6, ratio: 2, index: .7});
  [[2, 74], [2.5, 76], [3, 78], [4, 81], [5.5, 78], [6, 76]].forEach(([beat, midi]) =>
    piano(mix, b(revealBeat + beat), midi, beat === 4 ? .62 : .52, {...PIANO, pan: .12, delay: .14}, {length: 2.8}));

  // Lean into the groove: A13sus pulls back to D as "Matching Sonnet-5" appears.
  const grooveStart = Math.round((f.benchmark - start) / BEAT);
  pad(mix, b(7), b(grooveStart), CHORD.A13sus, PAD, {attack: .5, release: .5, cutoff: [900, 2200], level: .75});
  bass(mix, b(7), ROOT.A - 12, (grooveStart - 7) * BEAT, .45, LOW);
  riser(mix, b(grooveStart - 2), b(grooveStart), {bus: 'music', hall: .2}, {level: .045, fromMidi: 57, toMidi: 81});
  clap(mix, b(grooveStart - .5), .35, {...DRUM, room: .4});
  clap(mix, b(grooveStart - .25), .45, {...DRUM, room: .4});

  // The groove: I – vi – IV – V; the split door slamming shut is its last downbeat.
  const grooveEnd = Math.round((f.coverShut - start) / BEAT);
  const chords: [number, keyof typeof ARP][] = [[grooveStart, 'D'], [grooveStart + 4, 'Bm'], [grooveStart + 8, 'G'], [grooveStart + 12, 'A']];
  const roots: Record<keyof typeof ARP, number> = {D: ROOT.D, Bm: ROOT.B, G: ROOT.G, A: ROOT.A, Em: ROOT.E};
  const pads: Record<keyof typeof ARP, readonly number[]> = {D: CHORD.Dmaj9, Bm: CHORD.Bm11, G: CHORD.Gmaj9, A: CHORD.A, Em: CHORD.Em9};
  chords.forEach(([beat, name]) => pad(mix, b(beat), b(Math.min(beat + 4, grooveEnd)), pads[name], PAD, {attack: .15, release: .4, cutoff: [1100, 1900], level: .62}));
  groove(mix, b, grooveStart, grooveEnd);
  eighthBass(mix, b, grooveStart, grooveEnd, beat => roots[pick(chords, beat)]);
  motor(mix, b, grooveStart, grooveEnd, beat => ARP[pick(chords, beat)], beat => beat < grooveStart + 2 ? .55 : .7, .7);
  // Piano answers the motif once per phrase, landing on the chord's colour tone.
  [[grooveStart + 4, [78, 76, 74]], [grooveStart + 8, [74, 78, 81]], [grooveStart + 12, [81, 83, 85]]].forEach(([beat, notes]) =>
    (notes as number[]).forEach((midi, i) => piano(mix, b((beat as number) + i * .5), midi, .48, {...PIANO, pan: .18, delay: .12}, {length: 2})));

  // The door shuts; hold the A for a breath before Issues.
  bell(mix, f.coverShut + .06, 81, .42, {...BELL, pan: -.2}, {decay: 1.8, ratio: 2, index: .6});
  bell(mix, f.coverShut + .1, 85, .38, {...BELL, pan: .2}, {decay: 1.8, ratio: 2, index: .6});
  pad(mix, b(grooveEnd), cues.issues.native + .2, CHORD.A13sus, PAD, {attack: .1, release: .6, cutoff: [2200, 700], level: .6});
  riser(mix, b(grooveEnd) + .1, cues.issues.native, {bus: 'music', hall: .2}, {level: .05, fromMidi: 57, toMidi: 81});
}

function issuesAndLogo(mix: Mix, cues: ScoreCues) {
  const i = cues.issues, b = beats(cues.chapter.issues.start), conclusion = cues.conclusion;
  const first = Math.round((i.native - b(0)) / BEAT);
  const logoBeat = Math.round((conclusion.logo - b(0)) / BEAT);
  const buildBeat = logoBeat - 4;
  // D – G – Bm – A, then the IV–V lift into the logo's I.
  const chords: [number, keyof typeof ARP][] = [[first, 'D'], [first + 4, 'G'], [first + 8, 'Bm'], [first + 12, 'A'], [buildBeat, 'G'], [buildBeat + 2, 'A']];
  const roots: Record<keyof typeof ARP, number> = {D: ROOT.D, Bm: ROOT.B, G: ROOT.G, A: ROOT.A, Em: ROOT.E};
  const pads: Record<keyof typeof ARP, readonly number[]> = {D: CHORD.Dmaj9, Bm: CHORD.Bm11, G: CHORD.Gmaj9, A: CHORD.A13sus, Em: CHORD.Em9};
  chords.forEach(([beat, name], index) => {
    const end = index + 1 < chords.length ? chords[index + 1][0] : logoBeat;
    pad(mix, b(beat), b(end), pads[name], PAD, {attack: .2, release: .5, cutoff: index >= 4 ? [1400, 2800] : [900, 1600], level: .6});
  });
  kick(mix, b(first), .9, DRUM);
  groove(mix, b, first + 1, first + 8, {level: .75});
  groove(mix, b, first + 8, buildBeat, {level: .6, clap: false});
  groove(mix, b, buildBeat, logoBeat - 1, {level: .85});
  eighthBass(mix, b, first, logoBeat - 1, beat => roots[pick(chords, beat)], .65);
  motor(mix, b, first + 8, logoBeat - 1, beat => ARP[pick(chords, beat)], beat => beat < buildBeat ? .42 : .6, .6);

  // "Unlock the insights…": the motif climbs, and everything breathes in before the logo.
  [[buildBeat, 74], [buildBeat + .5, 76], [buildBeat + 1, 78], [buildBeat + 2, 81], [buildBeat + 2.5, 83], [buildBeat + 3, 85]].forEach(([beat, midi]) =>
    piano(mix, b(beat), midi, .5 + (beat - buildBeat) * .04, {...PIANO, pan: .15}, {length: 2}));
  riser(mix, b(buildBeat), conclusion.logo - .12, {bus: 'music', hall: .25}, {level: .07, fromMidi: 45, toMidi: 81});
  reverseSwell(mix, conclusion.logo, 1.1, [74, 78, 81, 86, 90], {bus: 'music', hall: .2});

  // Logo: the motif resolves as one gesture — a felt-piano D major 9 under four glass notes.
  const logo = conclusion.logo, tail = conclusion.end - logo;
  [26, 38, 50, 57, 64, 66, 69, 74].forEach((midi, n) => piano(mix, logo + n * .01, midi, n < 2 ? .7 : .62, {...PIANO, pan: -.35 + n * .1}, {length: tail + .5}));
  [86, 88, 90, 93].forEach((midi, n) => bell(mix, logo + n * .09, midi, .5 - n * .04, {...BELL, pan: -.3 + n * .2}, {decay: 1.6, ratio: 2, index: .7}));
  pad(mix, logo, conclusion.end - 1.3, CHORD.Dmaj9, PAD, {attack: .05, release: 1.3, cutoff: [2200, 700], level: .7});
  bass(mix, logo, ROOT.D - 12, tail - .4, .45, LOW);
}
