import type {ScoreCues} from '../cues';
import {chordAt, pulse, toneOf, type Chord} from '../rounded';
import {bowed, pizz, timpani, type Mix, type Route} from '../voices';
import {drainLine, humanize} from '../writing';
import {note, run, step, trill} from '../tempesta/instruments';

/*
 * Primavera — a chamber string concerto for spring morning light. Allegro, 120 BPM, E major moving
 * up to A major: Vivaldi's "Spring" birdsong over a Bach continuo. The solo violin sits back in the
 * hall on its soft layer and sings rather than shouts; celli walk in eighths, the section breathes
 * sustained chords, and pizzicato keeps it springing. The insights are a circle-of-fifths sequence,
 * "If only" leans on a hopeful ♭VI, the budget drains through the violin alone, and "Until now."
 * is a birdsong trill that blooms into A major. The logo is a plagal "amen" on A.
 */

export const BEAT = 60 / 120;
const BAR = BEAT * 4, S8 = BEAT / 2, S16 = BEAT / 4;
const SOLO: Route = {bus: 'music', hall: .5, room: .08, pan: .12};
const CANON: Route = {bus: 'music', hall: .5, room: .05, pan: -.4};
const PAD: Route = {bus: 'music', hall: .55, room: .04, pan: -.25};
const VC: Route = {bus: 'music', hall: .4, room: .08, pan: .3};
const PLK: Route = {bus: 'music', hall: .4, room: .1, pan: -.15};
const DRUM: Route = {bus: 'music', hall: .5, room: .08};

export const E_MAJOR = [4, 6, 8, 9, 11, 1, 3], A_MAJOR = [9, 11, 1, 2, 4, 6, 8];

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
// E major
const E = v(40, 56, 59, 64, 68), CSM = v(37, 56, 61, 64, 68), AMAJ7 = v(33, 56, 61, 64, 69), B7 = v(35, 54, 57, 63, 66);
const FSM7 = v(42, 57, 61, 64, 69), GSM = v(44, 56, 59, 63, 68), GS7 = v(44, 56, 60, 63, 66), DSHALF = v(39, 54, 57, 61, 63);
const A = v(45, 57, 61, 64, 69), CMAJ7 = v(36, 55, 59, 64, 67), EMAJ9 = v(40, 56, 59, 63, 66);
// A major
const E7 = v(40, 56, 59, 62, 68), FSM = v(42, 57, 61, 66, 69), D = v(38, 57, 62, 66, 69), CS = v(37, 56, 61, 64, 68);
const BM = v(35, 54, 59, 62, 66), DMAJ7 = v(38, 57, 61, 66, 69), FMAJ7 = v(41, 57, 60, 64, 69), CS7 = v(37, 56, 59, 65, 68);
const AA = v(33, 57, 61, 64, 69);

export function primaveraPlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bars = pulse(flow.reveal, BAR);
  const c = (at: number, voicing: Voicing): Chord => ({at, ...voicing});
  const loop = (from: number, to: number, cycle: readonly Voicing[]) =>
    [c(from, cycle[0]), ...bars.steps(from + BEAT * 1.5, to - BEAT).map((s, i) => c(s.time, cycle[(i + 1) % cycle.length]))];
  const insightsEnd = u2.cloudIn.at + u2.cloudIn.duration * .7;
  return [
    ...loop(0, u2.failure, [E, CSM, AMAJ7, B7]), c(u2.failure, CSM), c(u2.backtrack.at, AMAJ7), c(u2.highlight.at, FSM7), c(u2.warning, GS7),
    ...loop(u2.insights, insightsEnd, [E, A, DSHALF, GSM, CSM, FSM7, B7, E]), c(u2.ifOnly, CMAJ7), c(cost.cloudOut.at - BAR, B7),
    ...loop(cost.cloudOut.at, cost.missIssues, [E, GSM, A, B7]), c(cost.missIssues, GS7), c(cost.missIssues + BAR, B7),
    ...loop(cost.bashStop, cost.depletion.at, [E, CSM, A, B7]), c(cost.depletion.at, EMAJ9), c(flow.entry.at - BAR * .5, E7),
    ...loop(flow.reveal, flow.coverShut, [AA, CS, FSM, CS, D, AA, BM, E7]), c(flow.coverShut, FMAJ7),
    ...loop(issues.leadIn.at, issues.prelude.zoomOut.at, [FSM, DMAJ7, BM, CS7]), c(issues.prelude.zoomOut.at, D), c(issues.prelude.zoomOut.at + BAR, E7),
    ...loop(issues.native, conclusion.start, [AA, FSM, D, E7]), c(conclusion.start, D), c(conclusion.start + BAR, E7),
    c(conclusion.logo, D), c(conclusion.logo + BAR * .5, AA),
  ].sort((a, b) => a.at - b.at);
}

/** The key at `time`; the foley shares it. E7 at the flow entry is already A major's dominant. */
export const primaveraScale = (cues: ScoreCues, time: number) => time >= cues.flow.entry.at - BAR * .5 - .01 ? A_MAJOR : E_MAJOR;

// Two-bar melodies in eighths: scale steps from the chord root near E5, `null` holds the previous note.
const MOTIFS: readonly (readonly (number | null)[])[] = [
  [0, null, 2, 4, 5, null, 4, 2, 3, null, 1, 2, 0, null, null, -1],
  [4, null, 5, 4, 2, null, 0, 1, 2, 4, 7, null, 6, 4, 5, null],
  [0, 1, 2, null, 4, null, 2, 4, 7, null, null, 6, 4, null, 2, null],
];
type Figure = 'prelude' | 'melody' | 'birds' | 'flow';

export function composePrimavera(mix: Mix, cues: ScoreCues) {
  const plan = primaveraPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues, end = cues.duration;
  const grid = pulse(flow.reveal, BEAT), bars = pulse(flow.reveal, BAR);
  const scaleAt = (time: number) => primaveraScale(cues, time);
  const slotOf = (index: number, per: number, length: number) => ((Math.round(index * per) % length) + length * 64) % length;

  /** A cadence point: the section's chord bowed warmly, celli root, a soft timpani, the soloist on top. */
  const arrival = (time: number, size: number, chord = chordAt(plan, time), length = 1) => {
    const dyn: [number, number] = [Math.min(.85, .45 + .25 * size), .4], level = Math.min(1, size);
    bowed(mix, time, time + length, chord.bass, VC, {section: 'celli', dynamics: dyn, attack: .03, release: .8, level: .8 * level});
    chord.pad.forEach((midi, i) => bowed(mix, time, time + length, midi, {...PAD, pan: -.45 + i * .25}, {section: 'violins', dynamics: dyn, attack: .04, release: 1, level: .45 * level, bright: .55}));
    bowed(mix, time, time + length, toneOf(chord, 0, 76), SOLO, {dynamics: [.45 + .15 * size, .35], attack: .06, release: .9, level: .55 * level, bright: .55});
    if (size >= 1) timpani(mix, time, chord.bass < 36 ? chord.bass + 12 : chord.bass, .28 * level, DRUM, {decay: 1.4});
  };
  /** A gentle swell into `to`: the section crescendos on the chord and the soloist climbs. */
  const rise = (from: number, to: number, level = 1, top = 88) => {
    const chord = chordAt(plan, from + .01);
    chord.pad.slice(-3).forEach((midi, i) => bowed(mix, from, to, midi, {...PAD, pan: -.3 + i * .3}, {section: 'violins', dynamics: [.15, .7 * level], attack: .5, release: .08, level: .5}));
    bowed(mix, from, to, chord.bass, VC, {section: 'celli', dynamics: [.2, .7 * level], attack: .5, release: .08, level: .7});
    const runFrom = Math.max(from, to - BAR * .5);
    run(mix, runFrom, to - .03, step(scaleAt(runFrom), top - 12, 0), top, scaleAt(runFrom), [.3, .55 * level], SOLO, {curve: 1.3, level: .6});
  };

  /** The soloist's note at slot `s` (16ths) of a bar over `chord`, or undefined for a rest. */
  const sixteenth = (kind: 'prelude' | 'birds' | 'flow', s: number, bar: number, chord: Chord, scale: readonly number[]) => {
    switch (kind) {
    // Bach's C-major-prelude shape: a rising broken chord, then its upper half twice.
    case 'prelude': return toneOf(chord, [0, 2, 4, 5, 6, 4, 5, 6, 0, 2, 4, 5, 6, 4, 5, 6][s] + (bar % 2 ? 1 : 0), 62);
    // Vivaldi's birds: a chirp (two quick neighbours) on each beat, resting between.
    case 'birds': return s % 4 === 3 ? undefined : step(scale, toneOf(chord, (s >> 2) % 3, 84), [0, 1, 0][s % 4]);
    // A running line that turns at the top: up for a bar, down for the next.
    case 'flow': return step(scale, toneOf(chord, 0, bar % 2 ? 83 : 71), bar % 2 ? -s : s);
    }
  };

  type Drive = {solo?: Figure; canon?: boolean; walk?: boolean; pizz?: boolean; pad?: boolean; timp?: boolean; level?: number | [number, number]};
  const drive = (from: number, to: number, spec: Drive) => {
    const [l0, l1] = typeof spec.level === 'number' ? [spec.level, spec.level] : spec.level ?? [1, 1];
    const levelAt = (time: number) => l0 + (l1 - l0) * Math.min(1, Math.max(0, (time - from) / Math.max(.01, to - from)));
    if (spec.solo && spec.solo !== 'melody') for (const {time, index} of grid.steps(from, to, 4)) {
      const s = slotOf(index, 4, 16), bar = Math.floor(index / 4 + 1e-6), chord = chordAt(plan, time + .001);
      const midi = sixteenth(spec.solo, s, bar, chord, scaleAt(time));
      if (midi === undefined) continue;
      const [at, velocity] = humanize(mix, time, (.36 + .16 * levelAt(time)) * (s % 4 === 0 ? 1 : .85));
      note(mix, at, midi, S16 * (spec.solo === 'birds' ? .7 : 1.05), velocity, {...SOLO, pan: .05 + .1 * ((midi - 70) / 20)}, {level: .62, bright: .5, offset: .02});
    }
    if (spec.solo === 'melody' || spec.canon) for (const {time, index} of grid.steps(from, to, 2)) {
      const e = slotOf(index, 2, 16), phrase = Math.floor(index / 8 + 1e-6), motif = MOTIFS[((phrase % MOTIFS.length) + MOTIFS.length) % MOTIFS.length];
      if (motif[e] === null) continue;
      let hold = 1; while (e + hold < 16 && motif[e + hold] === null) hold++;
      const chord = chordAt(plan, time + .001), scale = scaleAt(time), midi = step(scale, toneOf(chord, 0, 74), motif[e]!);
      const [at, velocity] = humanize(mix, time, .4 + .15 * levelAt(time));
      if (spec.solo === 'melody') bowed(mix, at, at + S8 * hold * .96, midi, SOLO, {dynamics: [velocity, velocity * .9], attack: .03, release: .25, level: .62, bright: .5, offset: .02});
      // The canon: the section answers the melody a bar later, an octave down.
      if (spec.canon && time + BAR < to) bowed(mix, at + BAR, at + BAR + S8 * hold * .96, Math.max(55, midi - 12), CANON, {section: 'violins', dynamics: [velocity * .8, velocity * .7], attack: .04, release: .3, level: .38, bright: .5});
    }
    for (const {time, index} of grid.steps(from, to, 2)) {
      const e = slotOf(index, 2, 8), chord = chordAt(plan, time + .001), level = levelAt(time), accent = e % 2 === 0 ? 1 : .8;
      // Continuo: the root on the beat, a passing scale tone on the off-beat, walking to the next chord.
      if (spec.walk) {
        const midi = e % 2 === 0 ? (e === 4 ? chord.bass + 7 : chord.bass) : step(scaleAt(time), chord.bass + [0, 2, 9, 4][e >> 1], 0);
        note(mix, time, midi + (midi < 36 ? 12 : 0), S8 * .8, (.45 + .25 * level) * accent, VC, {section: 'celli', level: .7 * level, bright: .55});
      }
      if (spec.pizz && e % 2 === 1) pizz(mix, time, toneOf(chord, [1, 2, 3, 2][e >> 1], 64), .32 * level, {...PLK, pan: -.35 + .15 * (e >> 1)}, {length: .45});
      if (spec.timp && e === 0) timpani(mix, time, chord.bass < 36 ? chord.bass + 12 : chord.bass, .18 * level, DRUM, {decay: .9});
    }
    if (spec.pad) for (const {time} of bars.steps(from, to - BEAT)) {
      const chord = chordAt(plan, time + .001), until = Math.min(to, time + BAR) + .05, level = levelAt(time);
      chord.pad.slice(1).forEach((midi, i) => bowed(mix, time, until, midi, {...PAD, pan: -.4 + i * .3}, {section: 'violins', dynamics: [.25 * level, .35 * level], attack: .25, release: .5, level: .42, bright: .45}));
    }
  };

  // ------------------------------------------------ Ultimate2: morning, the agent sets out.
  arrival(0, .7, chordAt(plan, 0), 1.6);
  drive(u2.firstThinking.at, u2.stream.at, {walk: true, pizz: true, pad: true, level: .6});
  drive(u2.stream.at, u2.failure - BEAT, {solo: 'prelude', walk: true, pizz: true, pad: true, level: [.6, .8]});
  rise(u2.failure - BAR, u2.failure, .8, 86);
  // The failure: a soft turn to C♯ minor, a long held note, the orchestra thins to celli and a clock.
  arrival(u2.failure, .8, chordAt(plan, u2.failure), 1.2);
  run(mix, u2.failure + .9, u2.upwardTurn.at + u2.upwardTurn.duration, 83, 68, E_MAJOR, [.45, .3], SOLO, {curve: .8, level: .55});
  [88, 83, 80, 76, 73, 68, 64].forEach((midi, i) => pizz(mix, u2.backtrack.at + i * .07, midi, .45 - i * .03, {...PLK, pan: .4 - i * .1}));
  for (const {time} of grid.steps(u2.backtrack.at + .4, u2.warning, 2)) note(mix, time, chordAt(plan, time).bass + 12, S8 * .7, .35, VC, {section: 'celli', level: .45});
  u2.drawers.forEach((time, i) => pizz(mix, time, [76, 80, 83][i], .5, {...PLK, pan: -.3 + i * .3}));
  bowed(mix, u2.highlight.at, u2.warning, 81, SOLO, {dynamics: [.25, .55], attack: .3, release: .2, level: .55, bright: .5});
  arrival(u2.warning, .7, chordAt(plan, u2.warning), .5);
  // The insights: a circle-of-fifths sequence, the melody over its own canon.
  const insightsEnd = u2.cloudIn.at + u2.cloudIn.duration * .7;
  arrival(u2.insights, .8, chordAt(plan, u2.insights), .5);
  drive(u2.insights, insightsEnd, {solo: 'melody', canon: true, walk: true, pad: true, level: [.6, .85]});
  drive(insightsEnd, u2.ifOnly - BAR, {solo: 'flow', walk: true, pizz: true, timp: true, level: [.85, 1]});
  rise(u2.ifOnly - BAR, u2.ifOnly, 1, 88);
  // "If only": a ♭VI major seventh, the question hanging in the high violin.
  arrival(u2.ifOnly, 1, chordAt(plan, u2.ifOnly), 1.6);
  bowed(mix, u2.ifOnly + .8, cost.cloudOut.at - BAR, 83, SOLO, {dynamics: [.4, .3], attack: .6, release: .6, level: .55, bright: .5});
  drive(cost.cloudOut.at - BAR, cost.cloudOut.at, {walk: true, pad: true, level: [.5, .9]});
  run(mix, cost.cloudOut.at - BEAT * 2, cost.cloudOut.at - .03, 71, 88, E_MAJOR, [.35, .6], SOLO, {curve: 1.2, level: .6});

  // ------------------------------------------------ Cost: birdsong, a stumble, then the full consort.
  arrival(cost.cloudOut.at, .9, chordAt(plan, cost.cloudOut.at), .5);
  drive(cost.cloudOut.at, cost.missIssues, {solo: 'birds', walk: true, pizz: true, pad: true, level: .8});
  // Cheap models slip: the line stumbles chromatically onto G♯7.
  [0, 1, 2, 3, 4].forEach(i => note(mix, cost.missIssues - .3 + i * .06, 83 - i, .09, .45, SOLO, {level: .6}));
  arrival(cost.missIssues, .75, chordAt(plan, cost.missIssues), .5);
  drive(cost.missIssues + BEAT, cost.bashStop - BAR, {walk: true, pizz: true, level: [.6, .8]});
  rise(cost.bashStop - BAR, cost.bashStop, 1, 86);
  // "Powerful": everyone plays, the soloist in running sixteenths over the canon.
  arrival(cost.bashStop, 1.1, chordAt(plan, cost.bashStop), .6);
  drive(cost.bashStop, cost.depletion.at - BEAT / 2, {solo: 'flow', canon: true, walk: true, pizz: true, timp: true, level: 1});
  arrival(cost.bashWarning, .8, chordAt(plan, cost.bashWarning), .35);
  // The budget runs out: the ensemble lets go and the violin drifts down alone.
  arrival(cost.depletion.at, .8, chordAt(plan, cost.depletion.at), .5);
  drainLine(cost.depletion.at + .3, cost.depletion.duration, 88, 24, () => EMAJ9.pad)
    .forEach(({time, midi, progress}) => note(mix, time, midi, .1 + .3 * progress, .5 - .2 * progress, SOLO, {level: .6 - .2 * progress, bright: .45}));
  bowed(mix, cost.depletion.at + .3, cost.depletion.at + cost.depletion.duration + .3, 40, VC, {section: 'celli', dynamics: [.4, .12], attack: .2, release: .8, level: .7});

  // "Until now.": birdsong over a held E7, a breath, and A major blooms.
  const drop = flow.reveal, breath = drop - BEAT * .5;
  const tension = Math.max(cost.depletion.at + cost.depletion.duration + .3, breath - BAR * 1.5);
  trill(mix, tension, breath - BEAT, 80, 2, [.25, .55], SOLO, 12);
  run(mix, breath - BEAT, breath, 76, 88, A_MAJOR, [.4, .6], SOLO, {curve: 1.2, level: .6});
  for (const midi of [56, 62, 68]) bowed(mix, tension, breath, midi, {...PAD, pan: -.3 + (midi - 56) / 20}, {section: 'violins', dynamics: [.1, .7], attack: .5, release: .08, level: .5});
  bowed(mix, tension, breath, 40, VC, {section: 'celli', dynamics: [.15, .7], attack: .5, release: .08, level: .7});

  // ------------------------------------------------ Flow-1: A major, full and bright.
  arrival(drop, 1.2, chordAt(plan, drop), 1.4);
  drive(drop, flow.cameraToAnalysis.at - BEAT, {solo: 'melody', canon: true, walk: true, pizz: true, pad: true, timp: true, level: 1});
  arrival(flow.cameraToAnalysis.at, .9, chordAt(plan, flow.cameraToAnalysis.at), .5);
  drive(flow.cameraToAnalysis.at + BEAT, flow.cameraToEngine.at - BAR * .5, {solo: 'prelude', walk: true, pizz: true, pad: true, level: 1});
  rise(flow.cameraToEngine.at - BAR * .5, flow.cameraToEngine.at, 1, 88);
  arrival(flow.cameraToEngine.at, 1, chordAt(plan, flow.cameraToEngine.at), .5);
  drive(flow.cameraToEngine.at + BEAT / 2, flow.coverShut - BEAT, {solo: 'flow', walk: true, pizz: true, timp: true, level: 1});
  run(mix, flow.coverShut - BEAT, flow.coverShut - .03, 76, 90, A_MAJOR, [.4, .65], SOLO, {curve: 1.2, level: .6});
  // The door shuts on a hopeful F major seventh: not an ending, a question.
  arrival(flow.coverShut, 1, chordAt(plan, flow.coverShut), 1.2);

  // ------------------------------------------------ Issues: F♯ minor, thoughtful, then the climb back to A.
  const {prelude} = issues;
  arrival(issues.leadIn.at, .8, chordAt(plan, issues.leadIn.at), .5);
  drive(issues.leadIn.at, prelude.zoomOut.at, {solo: 'melody', canon: true, walk: true, pad: true, level: .7});
  if (prelude.labels) drive(prelude.labels.at, prelude.labels.at + prelude.labels.duration, {pizz: true, level: .8});
  drive(prelude.zoomOut.at, issues.native - BAR * .5, {solo: 'prelude', walk: true, pizz: true, level: [.7, .9]});
  rise(issues.native - BAR * .5, issues.native, 1, 88);
  arrival(issues.native, 1.1, chordAt(plan, issues.native), .9);
  drive(issues.native, conclusion.start, {solo: 'flow', canon: true, walk: true, pizz: true, pad: true, timp: true, level: 1});
  arrival(issues.clusters[0], .8, chordAt(plan, issues.clusters[0]), .35);

  // ------------------------------------------------ Conclusion: the melody once more, and the amen.
  const logo = conclusion.logo;
  arrival(conclusion.start, .9, chordAt(plan, conclusion.start), .5);
  drive(conclusion.start, logo - BAR * .5, {solo: 'melody', walk: true, pizz: true, pad: true, level: [.85, 1]});
  rise(logo - BAR * .5, logo, 1, 88);
  arrival(logo, 1.1, chordAt(plan, logo), BAR * .5);
  const amen = logo + BAR * .5;
  arrival(amen, 1.2, chordAt(plan, amen), Math.max(.5, end - amen - .8));
  bowed(mix, amen, end - .3, 88, SOLO, {dynamics: [.45, .25], attack: .2, release: .8, level: .55, bright: .5});
}
