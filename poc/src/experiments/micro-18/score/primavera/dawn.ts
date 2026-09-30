import type {ScoreCues} from '../cues';
import {chordAt, pulse, speaking, toneOf, type Chord} from '../rounded';
import {bowed, pizz, timpani, type Mix, type Route} from '../voices';
import {humanize} from '../writing';
import {note, roll, run} from '../tempesta/instruments';
import {A_MAJOR} from './composition';
import {ambientLayers, ambientPlan, DROP} from './ambient';

/*
 * Primavera dawn — the ambient spring bed for the problem, then daylight for the answer. Up to the
 * budget running out it is primavera-ambient: soft add9 chords, drones and droplets, bright but
 * unresolved. Under "Until now." the strings swell on an E sus4 dominant over a timpani roll, the
 * suspension falls to E7, and "Introducing Flow-1" lands on a full A major tutti. From there the
 * harmony only moves through consonant diatonic chords (I–V6–vi–IV…), celli pulse in eighths, and
 * a slow singing line rises across the announcement. Every section boundary (the cover shutting,
 * "It clusters issues", the logo) resolves V–I onto A.
 */

const BEAT = 60 / 120, BAR = BEAT * 4, S8 = BEAT / 2;
const PAD: Route = {bus: 'music', hall: .55, room: .04, pan: -.2};
const DRONE: Route = {bus: 'music', hall: .5, room: .05, pan: .25};
const PULSE: Route = {bus: 'music', hall: .35, room: .08, pan: .3};
const AIR: Route = {bus: 'music', hall: .7, room: .02, pan: .35};
const THEME: Route = {bus: 'music', hall: .55, room: .05, pan: .1};
const DRUM: Route = {bus: 'music', gain: .7, hall: .5, room: .08};

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
const ESUS = v(40, 59, 64, 69, 71), E7 = v(40, 59, 62, 64, 68), E = v(40, 59, 64, 68, 71);
const A = v(33, 57, 61, 64, 69), ACS = v(37, 57, 61, 64, 69), EGS = v(44, 59, 64, 68, 71);
const FSM7 = v(42, 57, 61, 64, 69), D = v(38, 57, 62, 66, 69), BM7 = v(35, 57, 62, 66, 69);

/** The ambient plan until the budget runs out, then the dominant and A major's diatonic walk. */
export function dawnPlan(cues: ScoreCues): Chord[] {
  const {cost, flow, issues, conclusion} = cues, reveal = flow.reveal, logo = conclusion.logo;
  const bars = pulse(reveal, BAR);
  const c = (at: number, voicing: Voicing): Chord => ({at, ...voicing});
  const walk = (from: number, to: number, cycle: readonly Voicing[]) =>
    bars.steps(from, to - BEAT).map((s, i) => c(s.time, cycle[i % cycle.length]));
  return [
    ...ambientPlan(cues).filter(chord => chord.at < cost.depletion.at + .01),
    c(reveal - BAR * .75, ESUS), c(reveal - BEAT * .75, E7),
    // Flow-1: I V6 vi IV I ii7 V, and the cover shuts on the tonic.
    ...walk(reveal, flow.coverShut, [A, EGS, FSM7, D, A, BM7, E]), c(flow.coverShut, A),
    // Signals and Issues open on IV, wander through vi and ii, and cadence onto "It clusters issues".
    ...walk(flow.coverShut + BEAT * 2, issues.native - BAR * .5, [D, ACS, BM7, A, FSM7, D]), c(issues.native - BAR * .5, E), c(issues.native, A),
    ...walk(issues.native + BEAT, conclusion.start, [EGS, FSM7, ACS]),
    // The conclusion: IV, vi7, ii7, the suspension once more, and it resolves on the logo.
    c(conclusion.start, D), c(logo - BAR * 1.5, FSM7), c(logo - BAR, BM7), c(logo - BAR * .5, ESUS), c(logo - BEAT * .75, E), c(logo, A),
  ].sort((a, b) => a.at - b.at);
}

/** The singing line's register over time: it climbs across each section and peaks at the resolutions. */
function themeTarget(cues: ScoreCues, time: number) {
  const {flow, issues, conclusion} = cues;
  const points: [number, number][] = [
    [flow.reveal, 81], [flow.reveal + BAR * 2, 76], [flow.coverShut - BAR, 80], [flow.coverShut, 81],
    [issues.leadIn.at + BAR, 78], [issues.prelude.zoomOut.at, 74], [issues.native - BAR * .5, 80], [issues.native, 81],
    [conclusion.start, 83], [conclusion.logo - BAR, 80], [conclusion.logo, 81],
  ];
  const i = points.findIndex(([at]) => at > time);
  if (i <= 0) return points[i === 0 ? 0 : points.length - 1][1];
  const [[t0, m0], [t1, m1]] = [points[i - 1], points[i]];
  return m0 + (m1 - m0) * (time - t0) / (t1 - t0);
}

export function composePrimaveraDawn(mix: Mix, cues: ScoreCues) {
  const plan = dawnPlan(cues), {flow, issues, conclusion} = cues, end = cues.duration;
  const reveal = flow.reveal, logo = conclusion.logo, suspend = reveal - BAR * .75;
  const grid = pulse(reveal, BEAT);
  ambientLayers(mix, cues, plan, suspend);

  // ------------------------------------------------ "Until now.": the dominant swells and the suspension falls.
  ESUS.pad.forEach((midi, k) => bowed(mix, suspend - .3, reveal - BEAT * .75 + .15, midi, {...PAD, pan: -.5 + k * .33}, {section: 'violins', dynamics: [.14, .42], attack: 1, release: .1, level: .42, bright: .45}));
  E7.pad.forEach((midi, k) => bowed(mix, reveal - BEAT * .75, reveal + .05, midi, {...PAD, pan: -.5 + k * .33}, {section: 'violins', dynamics: [.42, .46], attack: .06, release: .06, level: .42, bright: .5}));
  bowed(mix, suspend - .3, reveal + .05, 40, DRONE, {section: 'celli', dynamics: [.18, .45], attack: 1, release: .06, level: .7, bright: .4});
  for (const {time, index} of grid.steps(suspend, reveal - .1, 2)) pizz(mix, time, Math.round(index * 2) % 2 ? 71 : 64, .14 + .14 * (time - suspend) / (reveal - suspend), {...DROP, pan: Math.round(index * 2) % 2 ? .3 : -.3}, {length: .4});
  roll(mix, reveal - BEAT * 1.5, reveal - .04, 40, [.02, .09], DRUM);
  const voiceOut = Math.max(reveal - BEAT * 1.2, ...cues.voice.filter(s => s.at < reveal).map(s => s.at + s.duration + .05));
  run(mix, voiceOut, reveal - .02, 71, 80, A_MAJOR, [.3, .5], THEME, {curve: 1.2, level: .5});

  // ------------------------------------------------ The answer: every chord from the reveal to the end.
  const tutti = (time: number) => Math.abs(time - reveal) < .01 || Math.abs(time - logo) < .01;
  plan.forEach((chord, i) => {
    if (chord.at < reveal - .01) return;
    const next = plan[i + 1]?.at ?? end, from = chord.at, to = Math.min(end - .2, next + .25), last = !plan[i + 1];
    const bloom = tutti(from), dyn: [number, number] = bloom ? [.45, .3] : [.3, .28];
    chord.pad.forEach((midi, k) => bowed(mix, from, to, midi, {...PAD, pan: -.5 + k * .33}, {section: 'violins', dynamics: dyn, attack: bloom ? .05 : .3, release: last ? 2.2 : .9, level: .42, bright: .45, offset: .08 * k}));
    const root = chord.bass < 36 ? chord.bass + 12 : chord.bass;
    bowed(mix, from, to, root, DRONE, {section: 'celli', dynamics: bloom ? [.42, .3] : [.3, .26], attack: bloom ? .04 : .3, release: last ? 2.2 : .9, level: .65, bright: .35});
    bowed(mix, from + (bloom ? 0 : .4), to, toneOf(chord, 1, 83), AIR, {dynamics: bloom ? [.3, .16] : [.15, .16], attack: bloom ? .3 : 1.2, release: 1.2, level: .3, bright: .35});
  });
  for (const time of [reveal, flow.coverShut, issues.native, logo]) {
    const {bass} = chordAt(plan, time + .001), size = time === reveal || time === logo ? 1 : .7;
    timpani(mix, time, bass < 36 ? bass + 12 : bass, .22 * size, DRUM, {decay: 1.6});
    [0, 1, 2, 3, 4, 5].forEach(k => pizz(mix, time + k * .07, toneOf(chordAt(plan, time + .001), k, 64 + 5 * (time === logo ? 1 : 0)), .2 * size, {...DROP, pan: -.4 + k * .16}, {length: 1}));
  }

  // The heartbeat: celli eighths on the root and off-beat pizzicato, forward but never busy.
  for (const {time, index} of grid.steps(reveal, logo, 2)) {
    const chord = chordAt(plan, time + .001), e = ((Math.round(index * 2) % 8) + 8) % 8;
    const lift = time >= issues.native ? 1 : time >= flow.coverShut && time < issues.native - BAR ? .8 : .9;
    const pitch = chord.bass < 36 ? chord.bass + 24 : chord.bass + 12;
    const [at, velocity] = humanize(mix, time, (e % 2 ? .24 : .32) * lift);
    note(mix, at, pitch, S8 * .75, velocity, PULSE, {section: 'celli', level: .5, bright: .45});
    if (e % 2 === 1) pizz(mix, at, toneOf(chord, [2, 3, 4, 3][e >> 1], 64), .24 * lift, {...DROP, pan: -.35 + .15 * (e >> 1)}, {length: .5});
  }

  // The theme: the chord tone nearest a slowly climbing target, every half bar, held while it repeats.
  const line: {at: number; midi: number}[] = [];
  for (const {time} of grid.steps(reveal, logo + .01, 2)) {
    const chord = chordAt(plan, time + .001), target = themeTarget(cues, time), prev = line.at(-1)?.midi;
    let best = toneOf(chord, 0, 64);
    for (let midi = 64; midi <= 90; midi++) if (toneOf(chord, 0, midi) === midi && Math.abs(midi - target) < Math.abs(best - target)) best = midi;
    const keep = prev !== undefined && toneOf(chord, 0, prev) === prev && Math.abs(prev - target) <= 2;
    const midi = keep ? prev : best;
    if (midi !== prev) line.push({at: time, midi});
  }
  line.forEach(({at, midi}, i) => {
    const until = i + 1 < line.length ? line[i + 1].at + .06 : end - .4, final = i === line.length - 1;
    const soft = speaking(cues, at + .2, .1);
    bowed(mix, at, until, midi, THEME, {dynamics: [soft ? .24 : .34, final ? .18 : soft ? .22 : .28], attack: .18, release: final ? 2 : .3, level: .45, bright: .4});
  });
}
