import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {beep, bowed, pizz, timpani, type Mix, type Route} from '../voices';
import {chordAt, drainLine, humanize, legato, progression, type Chord, type Progression} from '../writing';

/*
 * "Aria" — D major, a solo violin over a small string orchestra (VSCO-2 samples). The trace is the
 * violin's own moto perpetuo, bariolage against the open A; failure is a borrowed G minor and a sigh.
 * Cheap models are thin, high pizzicato that trips; powerful ones are heavy celli. The cost falls down
 * a lament bass until one violin F♯ is left alone; after a breath, that F♯ is the third of D for Flow-1.
 * The theme (A–D–F♯–E–D–C♯) leaves its C♯ hanging until the logo resolves it to D.
 */

const SOLO: Route = {bus: 'music', hall: .4, room: .06, pan: .12};
const SECTION: Route = {bus: 'music', hall: .5, room: .04};
const PLUCK: Route = {bus: 'music', hall: .36, room: .1};
const DRUM: Route = {bus: 'music', hall: .35};
const DATA: Route = {bus: 'music', gain: .8, hall: .3, delay: .25};

const C = {
  D: {bass: 38, tones: [50, 57, 62, 66, 69]}, AC: {bass: 37, tones: [49, 57, 61, 64, 69]},
  Bm: {bass: 35, tones: [50, 54, 59, 62, 66]}, Bm7: {bass: 35, tones: [50, 54, 57, 62, 66]},
  G: {bass: 43, tones: [50, 55, 59, 62, 67]}, DF: {bass: 42, tones: [50, 57, 62, 66, 69]},
  Em7: {bass: 40, tones: [50, 55, 59, 62, 67]}, A7: {bass: 45, tones: [52, 57, 61, 64, 67]},
  A: {bass: 45, tones: [52, 57, 61, 64, 69]}, Gm: {bass: 43, tones: [50, 55, 58, 62, 67]},
  A7sus: {bass: 45, tones: [52, 57, 62, 64, 67]},
} satisfies Record<string, Chord>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Sustained section chord: celli take the bass (and its octave below), violins the top tones. */
function ensemble(mix: Mix, start: number, end: number, chord: Chord, options: {dynamics?: [number, number]; attack?: number; release?: number; top?: number; level?: number; low?: boolean} = {}) {
  const tones = chord.tones.slice(-(options.top ?? 3)), level = (options.level ?? 1) * .75 / Math.sqrt(tones.length + 1);
  const shared = {dynamics: options.dynamics ?? [.5, .5] as [number, number], attack: options.attack ?? .4, release: options.release ?? .9, level};
  bowed(mix, start, end, chord.bass, {...SECTION, pan: -.35}, {...shared, section: 'celli', level: level * 1.3});
  if (options.low) bowed(mix, start, end, chord.bass - 12, {...SECTION, pan: -.45}, {...shared, section: 'celli', level: level * .9});
  tones.forEach((midi, i) => bowed(mix, start, end, midi, {...SECTION, pan: -.1 + .45 * i / Math.max(1, tones.length - 1)}, {...shared, section: 'violins', bright: .5}));
}

/** Broken-chord pizzicato: `tones[pattern[k]]` per step, k counted from the current chord's start. */
function plucked(mix: Mix, grid: (beat: number) => number, from: number, to: number, chords: Progression, options: {
  step: number; pattern: readonly number[]; velocity: (beat: number) => number; route?: Route; octave?: number;
}) {
  const first = Math.ceil(from / options.step - 1e-9);
  for (let n = first; n * options.step < to - 1e-9; n++) {
    const beat = n * options.step, [start, chord] = chordAt(chords, beat);
    const k = Math.round((beat - Math.max(start, from)) / options.step);
    const midi = chord.tones[options.pattern[k % options.pattern.length] % chord.tones.length] + (options.octave ?? 12);
    const [time, velocity] = humanize(mix, grid(beat), options.velocity(beat) * (k % 2 ? .85 : 1));
    pizz(mix, time, midi, velocity, {...options.route ?? PLUCK, pan: -.35 + .7 * clamp01((midi - 55) / 36)}, {length: .9});
  }
}

/** Driving celli: short, accented bows on every eighth — the motor under Flow-1. */
function motor(mix: Mix, grid: (beat: number) => number, from: number, to: number, chords: Progression, velocity: (beat: number) => number) {
  for (let beat = Math.ceil(from * 2 - 1e-9) / 2; beat < to - 1e-9; beat += .5) {
    const [, chord] = chordAt(chords, beat), step = Math.round(beat * 2) % 4;
    const [time, v] = humanize(mix, grid(beat), velocity(beat) * (step === 0 ? 1 : step === 2 ? .9 : .72));
    bowed(mix, time, time + .2, chord.bass - (step === 2 ? 0 : 12), {...SECTION, pan: -.4}, {section: 'celli', dynamics: [.95, .8], attack: .008, release: .12, level: v});
  }
}

/** `acoustic` drops every electronic voice: no telemetry beeps, and the violin itself plays the budget draining. */
export function composeAria(mix: Mix, cues: ScoreCues, {acoustic = false} = {}) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;

  // ── You build agents: an open D–A fifth in pizzicato, a violin A floating above a celli pedal.
  pizz(mix, u2.agentEnter + .02, 62, .75, {...PLUCK, pan: -.2});
  pizz(mix, u2.agentEnter + .05, 69, .7, {...PLUCK, pan: .2});
  bowed(mix, u2.agentEnter, u2.stream.at + .3, 38, {...SECTION, pan: -.35}, {section: 'celli', dynamics: [.35, .5], attack: .9, release: .8, level: .8});
  legato(mix, g, [[1.5, 81, 2.25, [.45, .6]]], SOLO, {release: .5});

  // ── Every time it runs, it leaves a trace: moto perpetuo, bariolage across the open A string.
  const streamFrom = at(u2.stream.at), failBeat = (u2.failure - g(0)) / .5;
  const bariolage: [number, readonly number[]][] = [[streamFrom, [62, 69, 66, 69]], [streamFrom + 2, [61, 69, 64, 69]], [streamFrom + 4, [62, 69, 66, 71]]];
  for (let beat = Math.ceil(streamFrom * 4) / 4, k = 0; beat < failBeat - 1e-9; beat += .25, k++) {
    const figure = [...bariolage].reverse().find(([from]) => from <= beat + 1e-9)![1];
    const [time, v] = humanize(mix, g(beat), .5 + .3 * (beat - streamFrom) / (failBeat - streamFrom));
    bowed(mix, time, time + .11, figure[k % 4], {...SOLO, pan: k % 2 ? .22 : .02}, {dynamics: [.9, .85], attack: .006, release: .07, level: v * (k % 2 ? .8 : 1)});
  }
  ensemble(mix, g(streamFrom), g(streamFrom + 2) + .05, C.D, {dynamics: [.35, .45], attack: .6, top: 2});
  ensemble(mix, g(streamFrom + 2), g(streamFrom + 4) + .05, C.AC, {dynamics: [.45, .5], attack: .3, top: 2});
  ensemble(mix, g(streamFrom + 4), u2.failure, C.Bm, {dynamics: [.5, .6], attack: .3, release: .15, top: 2});
  for (let beat = streamFrom + .5; beat < failBeat - .25 && !acoustic; beat += .25) {
    if (mix.random() > .3) continue;
    beep(mix, g(beat), [86, 90, 93, 98][Math.floor(mix.random() * 4)], .09, {...DATA, pan: (mix.random() - .5) * 1.2}, {length: .03});
  }

  // ── When your agent fails: the line breaks onto a borrowed G minor, and the violin sighs B♭ → A.
  ensemble(mix, u2.failure, u2.backtrack.at + .5, C.Gm, {dynamics: [.75, .35], attack: .05, release: 1, top: 2, low: true});
  legato(mix, g, [[failBeat, 70, 1.5, [.7, .5]], [failBeat + 1.5, 69, 1.25, [.5, .3]]], SOLO);
  const turn = at(u2.upwardTurn.at);
  legato(mix, g, [[turn + .5, 69, 1, .35], [turn + 1.5, 71, 1, .4], [turn + 2.5, 72, 1.5, [.45, .3]]], {...SOLO, pan: .05});

  // ── The trace can tell you why: a pizzicato rewind, then three drawers spell E minor 9.
  [86, 81, 78, 74, 69, 66, 62, 57].forEach((midi, i) => pizz(mix, u2.backtrack.at + i * .055, midi, .5 - i * .03, {...PLUCK, pan: .35 - i * .09}));
  bowed(mix, u2.drawers[0], u2.highlight.at + .4, 40, {...SECTION, pan: -.35}, {section: 'celli', dynamics: [.35, .5], attack: .8, release: 1, level: .45});
  u2.drawers.forEach((time, i) => pizz(mix, time, [67, 71, 74][i], .5 + i * .08, {...PLUCK, pan: -.2 + i * .2}));
  bowed(mix, u2.drawers[2], u2.highlight.at + .3, 78, SOLO, {dynamics: [.3, .5], attack: .5, release: .6, level: .8});
  ensemble(mix, u2.highlight.at, u2.insights + .3, C.G, {dynamics: [.5, .4], attack: .6, top: 3});

  // ── The insights are hidden across thousands of traces: sections open and the violin speaks the theme.
  const insights = at(u2.insights, 1), ifOnly = at(u2.ifOnly, 1);
  const hidden: Progression = [[insights, C.G], [insights + 2, C.DF], [insights + 4, C.Em7], [insights + 6, C.A7]];
  plucked(mix, g, insights, ifOnly, hidden, {step: .5, pattern: [0, 2, 1, 3], octave: 12, velocity: beat => .32 + .12 * Math.sin(Math.PI * (beat - insights) / (ifOnly - insights))});
  hidden.forEach(([beat, chord], i) => ensemble(mix, g(beat), g(i < 3 ? hidden[i + 1][0] : ifOnly) + .05, chord,
    {attack: i ? .3 : 1.2, release: .7, dynamics: [[.35, .55], [.55, .7], [.7, .85], [.85, .6]][i] as [number, number], top: 3}));
  legato(mix, g, [[insights + 1, 69, 1, .5], [insights + 2, 74, 1, .55], [insights + 3, 78, 1.5, .65], [insights + 4.5, 76, .5, .6], [insights + 5, 74, 2, .6], [insights + 7, 73, 2, [.6, .4]]], SOLO);

  // ── If only someone could read them all: G major 7 with a raised 11th — the question hangs.
  ensemble(mix, g(ifOnly), g(ifOnly + 2.5), {bass: 43, tones: [54, 59, 61, 66]}, {dynamics: [.55, .2], attack: .25, release: 1.4, top: 4, low: true});
  bowed(mix, g(ifOnly + .5), g(ifOnly + 2.5), 90, {...SOLO, pan: .3}, {dynamics: [.25, .15], attack: .6, release: 1, level: .6});

  // ── Cheap LLMs read traces efficiently: bright, thin pizzicato high up with no floor under it.
  const cheapFrom = at(cost.cloudOut.at, 1), miss = at(cost.missIssues, 1);
  const cheap: Progression = [[cheapFrom, {bass: 38, tones: [62, 66, 69, 66]}], [cheapFrom + 2, {bass: 37, tones: [61, 64, 69, 64]}], [cheapFrom + 4, {bass: 35, tones: [62, 66, 71, 66]}]];
  plucked(mix, g, cheapFrom, miss, cheap, {step: .25, pattern: [0, 1, 2, 3], octave: 12, velocity: () => .42});
  // …but fail to find crucial issues: the run trips over wrong notes onto a tritone.
  [[0, 81], [.25, 78], [.5, 75]].forEach(([beat, midi]) => pizz(mix, g(miss + beat), midi, .5, {...PLUCK, pan: .2}));
  bowed(mix, g(miss + 1), cost.cameraToBash.at + cost.cameraToBash.duration, 36, {...SECTION, pan: -.35}, {section: 'celli', dynamics: [.3, .65], attack: .5, release: .6, level: .55});
  bowed(mix, g(miss + 1), g(miss + 3), 42, {...SECTION, pan: -.2}, {section: 'celli', dynamics: [.35, .2], attack: .2, release: .9, level: .4});
  bowed(mix, g(miss + 1) + .02, g(miss + 2.5), 71, {...SOLO, pan: .25}, {dynamics: [.45, .2], attack: .08, release: .8, level: .55});

  // ── Powerful LLMs find deep issues: heavy celli tread every beat through B minor.
  const heavyFrom = Math.ceil(at(cost.powerful)), budgetBeat = at(cost.cameraToBudget.at, 1);
  const heavy: Progression = [[heavyFrom, C.Bm], [heavyFrom + 2, C.G], [heavyFrom + 4, C.Em7], [heavyFrom + 6, {bass: 42, tones: [49, 54, 58, 61, 66]}]];
  for (let beat = heavyFrom; beat < budgetBeat - 1e-9; beat++) {
    const [start, chord] = chordAt(heavy, beat), downbeat = beat === start;
    const [time, v] = humanize(mix, g(beat), downbeat ? .95 : .75);
    bowed(mix, time, time + (downbeat ? .45 : .32), chord.bass - 12, {...SECTION, pan: -.45}, {section: 'celli', dynamics: [1, .8], attack: .01, release: .25, level: v * .8});
    bowed(mix, time + .004, time + (downbeat ? .45 : .32), chord.bass, {...SECTION, pan: -.3}, {section: 'celli', dynamics: [1, .8], attack: .01, release: .25, level: v * .7});
    if (downbeat) ensemble(mix, g(beat), g(beat + 2) + .05, chord, {dynamics: [.65, .5], attack: .12, release: .5, top: 2, level: .75});
  }
  timpani(mix, cost.bashStop, 35, .5, DRUM);

  // ── …but the costs are unsustainable: a warm G for a breath, then the lament bass thins the orchestra out.
  const drainBeat = at(cost.depletion.at, 1);
  ensemble(mix, g(budgetBeat), g(drainBeat), C.G, {dynamics: [.55, .7], attack: .6, release: .4, top: 3});
  legato(mix, g, [[budgetBeat + .5, 83, 2, .55], [budgetBeat + 2.5, 81, drainBeat - budgetBeat - 2.5, [.55, .5]]], SOLO);
  const lament: [Chord, number][] = [[C.Bm, 83], [{bass: 33, tones: [57, 61, 64]}, 81], [{bass: 31, tones: [55, 59, 62]}, 79], [{bass: 30, tones: [54, 58, 61]}, 78]];
  const stepBeats = 1.5, entry = at(flow.entry.at, 1), drop = at(flow.reveal, 1);
  lament.forEach(([chord, top], i) => {
    const from = g(drainBeat + i * stepBeats), to = g(drainBeat + (i + 1) * stepBeats) + .05, last = i === 3;
    bowed(mix, from, last ? g(entry) : to, chord.bass + 12, {...SECTION, pan: -.35}, {section: 'celli', dynamics: [.75 - i * .12, .65 - i * .15], attack: .15, release: last ? 1.4 : .4, level: .6});
    chord.tones.slice(-(3 - i)).forEach((midi, k) => bowed(mix, from, to, midi, {...SECTION, pan: -.1 + .3 * k}, {section: 'violins', dynamics: [.6 - i * .1, .55 - i * .12], attack: .15, release: .4, level: .4}));
    if (!last && !acoustic) legato(mix, g, [[drainBeat + i * stepBeats, top, stepBeats, .55 - i * .07]], SOLO);
  });
  // The counter as spiccato: the solo violin runs down through each lament chord, slowing, into its lone F♯.
  if (acoustic) drainLine(cost.depletion.at, g(drainBeat + 3 * stepBeats) - cost.depletion.at, 90, 12, time => lament[Math.min(3, Math.floor((time - g(drainBeat)) / (stepBeats * .5)))][0].tones)
    .forEach(({time, midi, progress}) => bowed(mix, time, time + .1 + .25 * progress, midi, {...SOLO, pan: .22 - .2 * progress}, {dynamics: [.85, .75 - .2 * progress], attack: .006, release: .08 + .2 * progress, level: .75 - .25 * progress}));
  // ── Until now: the last F♯ holds alone, swells, and stops dead for a breath before the drop.
  bowed(mix, g(drainBeat + 3 * stepBeats), g(drop) - .24, 78, SOLO, {dynamics: [.35, .95], attack: .2, release: .05, offset: .12, level: .85});
  bowed(mix, g(entry), g(drop) - .24, 66, {...SECTION, pan: -.1}, {section: 'violins', dynamics: [.1, .9], attack: .8, release: .05, level: .5});
  [62, 66, 69, 74, 78, 81, 86, 90].forEach((midi, i) => acoustic
    ? pizz(mix, g(drop - 1) + i * .0625, midi, .3 + i * .05, {...PLUCK, pan: -.4 + i * .11})
    : beep(mix, g(drop - 1) + i * .0625, midi + 12, .05 + i * .01, {...DATA, pan: -.4 + i * .11}, {length: .05}));

  // ── Introducing Flow-1: the whole orchestra on D, driving celli, and the theme soaring an octave up.
  timpani(mix, flow.reveal, 38, .65, DRUM, {decay: 2});
  const sung: Progression = [[drop, C.D], [drop + 2, C.Bm], [drop + 4, C.G], [drop + 6, C.A]];
  sung.forEach(([beat, chord], i) => ensemble(mix, g(beat), g(beat + 2) + .05, chord, {attack: i ? .2 : .03, release: .6, top: 4, low: i === 0,
    dynamics: [[1, .8], [.8, .75], [.75, .8], [.8, .9]][i] as [number, number], level: 1.1}));
  pizz(mix, flow.reveal, 74, .8, {...PLUCK, pan: -.2}); pizz(mix, flow.reveal + .01, 81, .75, {...PLUCK, pan: .2});
  legato(mix, g, [[drop + 1, 81, 1, .75], [drop + 2, 86, 1, .8], [drop + 3, 90, 1.5, .9], [drop + 4.5, 88, .5, .8], [drop + 5, 86, 1, .8], [drop + 6, 85, 2, [.85, .7]]], SOLO, {bright: .7});

  // ── Matching Sonnet-5 at 2% of the cost: the motor keeps running, pizzicato spins a Glass-like ostinato.
  const pulse = drop + 8, swap = at(flow.numberSwap.at, 1), signals = at(flow.cameraToEngine.at, 1), shut = flow.coverShut;
  const shutBeat = (shut - g(0)) / .5;
  const bench = progression([pulse, C.D], [pulse + 2, C.AC], [pulse + 4, C.Bm7], [swap, C.G], [swap + 2, C.A], [swap + 4, C.DF], [signals, C.Bm], [signals + 2, C.G]);
  motor(mix, g, drop, shutBeat, progression(...sung, ...bench), beat => .5 + .25 * clamp01((beat - drop) / (shutBeat - drop)));
  plucked(mix, g, pulse, shutBeat, bench, {step: .25, pattern: [1, 3, 4, 3], octave: 12, velocity: beat => .3 + .15 * (beat - pulse) / (shutBeat - pulse)});
  bench.forEach(([beat, chord], i) => ensemble(mix, g(beat), g(i + 1 < bench.length ? bench[i + 1][0] : shutBeat) + .05, chord,
    {attack: .25, release: .5, top: 2, dynamics: [.45 + i * .04, .5 + i * .04], level: .8}));
  // The bars grow: a pizzicato scale climbs and lands on a held high D.
  const scale = [62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81, 83, 85, 86];
  scale.forEach((midi, i) => pizz(mix, flow.barsGrow.at + flow.barsGrow.duration * (i / (scale.length - 1)) ** 1.15, midi, .4 + i * .02, {...PLUCK, pan: -.4 + i * .055}));
  bowed(mix, flow.barsGrow.at + flow.barsGrow.duration, flow.barsGrow.at + flow.barsGrow.duration + 1.4, 86, SOLO, {dynamics: [.7, .45], attack: .03, release: .8, level: .6});
  // Flow-1 powers Signals: the theme climbs over the engine; the door closes on A.
  legato(mix, g, [[signals, 74, 1, .7], [signals + 1, 76, 1, .75], [signals + 2, 78, .5, .8], [signals + 2.5, 79, shutBeat - signals - 2.5, [.85, .75]]], SOLO, {bright: .7});
  timpani(mix, shut, 33, .6, DRUM);
  ensemble(mix, shut, issues.native + .1, C.A, {attack: .03, release: 1, top: 4, low: true, dynamics: [.8, .25]});

  // ── It finds deep issues, in every trace: pizzicato raindrops where the triangles appear.
  const pentatonic = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
  issues.pops.forEach((pop, i) => {
    if (i % 2) return;
    const midi = pentatonic[Math.min(pentatonic.length - 1, Math.floor(pop.height * pentatonic.length))];
    pizz(mix, pop.at, midi, .34 + mix.random() * .12, {...PLUCK, pan: pop.pan * .8});
  });
  ensemble(mix, issues.native, g(Math.ceil(at(issues.travel.at))) + .1, C.D, {dynamics: [.35, .3], attack: .4, top: 2, level: .7});

  // …and clusters them into high-level patterns: motion returns, rising into the lock.
  const lock = issues.clusters[0], lockBeat = (lock - g(0)) / .5;
  const gather = Math.ceil(at(issues.travel.at));
  const patterns = progression([gather, C.G], [gather + 2, C.A7sus], [lockBeat, C.D], [lockBeat + 2.5, C.G], [lockBeat + 4.5, C.A7sus]);
  plucked(mix, g, gather, at(end.start, 1), patterns, {step: .5, pattern: [0, 2, 3, 4, 3, 2], octave: 12,
    velocity: beat => beat < lockBeat ? .3 + .14 * (beat - gather) / (lockBeat - gather) : .34});
  ensemble(mix, g(gather), lock + .02, {bass: 43, tones: [55, 59, 62, 66]}, {attack: 1, release: .2, dynamics: [.25, .85], top: 4});
  ensemble(mix, lock, g(at(end.start, 1)) + .1, C.D, {attack: .06, release: .8, top: 4, low: true, dynamics: [.8, .45]});
  // Ready for you or your coding agent: the violin settles, close and warm.
  legato(mix, g, [[lockBeat + 2.5, 78, 1.5, .5], [lockBeat + 4, 76, 1, .45], [lockBeat + 5, 74, 2, [.45, .3]]], SOLO);

  // ── Unlock the insights hiding in millions of traces: IV → V, the motor returns, the theme's C♯ waits.
  const unlock = at(end.start, 1), logo = end.logo, logoBeat = (logo - g(0)) / .5;
  const build: Progression = [[unlock, C.G], [unlock + 2, C.A]];
  motor(mix, g, unlock, logoBeat, build, beat => .45 + .35 * (beat - unlock) / (logoBeat - unlock));
  build.forEach(([beat, chord], i) => ensemble(mix, g(beat), g(beat + 2) + .03, chord, {attack: .3, release: .15, top: 4, dynamics: i ? [.7, 1] : [.45, .7]}));
  legato(mix, g, [[unlock, 74, 1, .6], [unlock + 1, 78, 1, .7], [unlock + 2, 81, 1.5, .8], [unlock + 3.5, 85, .5, .9]], SOLO, {bright: .7});
  for (let beat = logoBeat - 2; beat < logoBeat; beat += .125) timpani(mix, g(beat), 33, .08 + .3 * ((beat - logoBeat + 2) / 2) ** 2, DRUM, {decay: .5});

  // ── With Laminar: C♯ → D. Every string on D, the violin on top; pizzicato glints as it fades.
  timpani(mix, logo, 38, .6, DRUM, {decay: 2.2});
  ensemble(mix, logo, end.end - 1.1, {bass: 38, tones: [50, 57, 62, 66, 69, 74]}, {attack: .05, release: 1.1, top: 6, low: true, dynamics: [1, .3], level: 1.2});
  bowed(mix, logo, end.end - .9, 86, SOLO, {dynamics: [.9, .35], attack: .04, release: 1, level: .85, bright: .7});
  [[1.1, 86], [1.45, 90], [1.8, 93]].forEach(([delay, midi], i) => pizz(mix, logo + delay, midi, .4 - i * .05, {...PLUCK, pan: -.2 + i * .25}));
}
