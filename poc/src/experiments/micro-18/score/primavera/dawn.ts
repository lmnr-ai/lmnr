import type {ScoreCues} from '../cues';
import {chordAt, pulse, radialPops, speaking, toneOf, type Chord} from '../rounded';
import {bowed, pizz, timpani, type Mix, type Route} from '../voices';
import {humanize} from '../writing';
import {roll, run} from '../tempesta/instruments';
import {A_MAJOR} from './composition';
import {ambientLayers, ambientPlan, DROP, foleyKit, problemFoley} from './ambient';

/*
 * Primavera dawn — the ambient spring bed for the problem, then daylight for the answer. Up to the
 * budget running out it is primavera-ambient: soft add9 chords, drones and droplets, bright but
 * unresolved. Under "Until now." the strings swell on an E sus4 dominant over a timpani roll, the
 * suspension falls to E7, and "Introducing Flow-1" lands on A major. From there nothing is held
 * still: every voicing moves, there is no pedal, no high shimmer and no pizzicato clock, and a
 * violin theme climbs the A major scale one bar at a time. Each chapter plays a little fuller, and
 * the grid zoom-out completes the theme over IV–I–ii7–V7 into a wide A major on the logo.
 */

// The zoom-out plays on the loud layer for its warmth, so its levels come down to keep it ~3 dB over Flow-1.
const BEAT = 60 / 120, BAR = BEAT * 4, FINALE = .5;
const PAD: Route = {bus: 'music', hall: .55, room: .04, pan: -.2};
const DRONE: Route = {bus: 'music', hall: .5, room: .05, pan: .25};
const THEME: Route = {bus: 'music', hall: .55, room: .05, pan: .15};
const SECONDS: Route = {bus: 'music', hall: .55, room: .05, pan: -.3};
const DRUM: Route = {bus: 'music', gain: .7, hall: .5, room: .08};

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
// The dominant under "Until now."
const ESUS = v(40, 59, 64, 69, 71), E7 = v(40, 59, 62, 64, 68);
// The answer: the bass is the exact celli pitch, and no two neighbouring chords share a pad.
const A = v(45, 57, 64, 69, 73), ACS = v(49, 57, 64, 69, 73), EGS = v(44, 59, 64, 68, 71), E = v(40, 56, 59, 64, 68);
const FSM7 = v(42, 57, 61, 66, 69), D = v(38, 54, 62, 66, 74), BM7 = v(47, 59, 62, 66, 71);
// The finale: wide, with celli in octaves.
const D_WIDE = v(38, 54, 57, 62, 66, 69, 74), A_WIDE = v(45, 57, 61, 64, 69, 73, 76), BM7_WIDE = v(47, 57, 62, 66, 71, 74);
const E7_WIDE = v(40, 56, 59, 62, 64, 68, 71), A_FINAL = v(45, 57, 61, 64, 69, 73, 76, 81);

/** The timeline of the answer: where each chapter's chords fall. */
function sections(cues: ScoreCues) {
  const {flow, issues, conclusion} = cues, bars = pulse(flow.reveal, BAR);
  return {
    flow: bars.steps(flow.reveal, flow.coverShut - BEAT).map(s => s.time),
    issues: bars.steps(flow.coverShut + BEAT * 2, issues.native - BAR * .5 - BEAT).map(s => s.time),
    clusters: bars.steps(issues.native + BEAT, conclusion.start - BEAT).map(s => s.time),
    finale: [conclusion.start, conclusion.logo - BAR * 1.5, conclusion.logo - BAR, conclusion.logo - BAR * .5],
  };
}

/** The ambient plan until the budget runs out, then the dominant and A major's diatonic walk. */
export function dawnPlan(cues: ScoreCues): Chord[] {
  const {cost, flow, issues, conclusion} = cues, reveal = flow.reveal, at = sections(cues);
  const c = (time: number, voicing: Voicing): Chord => ({at: time, ...voicing});
  const walk = (times: number[], cycle: readonly Voicing[]) => times.map((time, i) => c(time, cycle[i % cycle.length]));
  return [
    ...ambientPlan(cues).filter(chord => chord.at < cost.depletion.at + .01),
    c(reveal - BAR * .75, ESUS), c(reveal - BEAT * .75, E7),
    // Flow-1: I V6 vi IV I ii7 V, and the cover shuts on the tonic.
    ...walk(at.flow, [A, EGS, FSM7, D, A, BM7, E]), c(flow.coverShut, A),
    // Signals and Issues: the bass walks down D C♯ B G♯ A, then IV–V–I onto "It clusters issues".
    ...walk(at.issues, [D, ACS, BM7, EGS, A, D]), c(issues.native - BAR * .5, E), c(issues.native, A),
    ...walk(at.clusters, [EGS, FSM7, ACS]),
    // The grid zoom-out: IV I ii7 V7, and a perfect cadence on the logo.
    ...walk(at.finale, [D_WIDE, A_WIDE, BM7_WIDE, E7_WIDE]), c(conclusion.logo, A_FINAL),
  ].sort((a, b) => a.at - b.at);
}

/** The theme as [time, midi]: a scale climbing to A5, a head motif, and the head again on the zoom-out. */
function theme(cues: ScoreCues): [number, number][] {
  const {flow, issues, conclusion} = cues, native = issues.native, logo = conclusion.logo, at = sections(cues);
  const on = (times: number[], notes: number[]) => notes.map((midi, i): [number, number] => [times[i], midi]);
  const notes: [number, number][] = [
    ...on(at.flow, [73, 71, 73, 74, 76, 78, 80]), [flow.coverShut, 81],
    ...on(at.issues, [78, 76, 78, 80, 81]),
    [native - BAR, 78], [native - BAR + .75, 81], [native - BEAT * 2, 83],
    [native, 85], ...on(at.clusters, [83, 81, 76]),
    ...on(at.finale, [78, 81, 83, 86]), [logo, 85],
  ];
  return notes.filter(([time]) => time !== undefined).sort((a, b) => a[0] - b[0]);
}

/** The dynamics per chapter: each one a little fuller, the zoom-out swelling into the logo. */
function arc(cues: ScoreCues, time: number) {
  const {issues, conclusion} = cues, logo = conclusion.logo;
  if (time < issues.leadIn.at) return {pad: .35, celli: .35, speech: .32, gap: .38};
  if (time < issues.native) return {pad: .37, celli: .37, speech: .34, gap: .4};
  if (time < conclusion.start - .01) return {pad: .4, celli: .4, speech: .38, gap: .44};
  const p = Math.min(1, (time - conclusion.start) / (logo - conclusion.start));
  if (time < logo - .01) return {pad: .45 + .17 * p, celli: .5 + .15 * p, speech: .5 + .12 * p, gap: .5 + .12 * p};
  return {pad: .62, celli: .65, speech: .62, gap: .62};
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
  // The pickup waits for the voice to clear; a phrase running into the reveal leaves no room, so there is no run.
  const voiceOut = Math.max(reveal - BEAT * 1.2, ...cues.voice.filter(s => s.at < reveal).map(s => s.at + s.duration + .05));
  if (voiceOut < reveal - .15) run(mix, voiceOut, reveal - .02, 71, 80, A_MAJOR, [.3, .5], THEME, {curve: 1.2, level: .5});

  // ------------------------------------------------ The answer: the section re-voices every chord, no pedal.
  const finale = (time: number) => time >= conclusion.start - .01;
  plan.forEach((chord, i) => {
    if (chord.at < reveal - .01) return;
    const from = chord.at, next = plan[i + 1]?.at ?? end, last = !plan[i + 1], to = last ? end - .2 : next + .2;
    const bloom = Math.abs(from - reveal) < .01;
    const dyn: [number, number] = bloom ? [.45, .32] : last ? [.62, .42] : [arc(cues, from).pad, arc(cues, next - .02).pad];
    chord.pad.forEach((midi, k) => bowed(mix, from, to, midi, {...PAD, pan: -.5 + k * (1 / Math.max(1, chord.pad.length - 1))}, {section: 'violins', dynamics: dyn, attack: bloom ? .05 : .25, release: last ? 2.2 : .6, level: finale(from) ? .42 * FINALE : .42, bright: .45, offset: .08 * k}));
    // Celli hold the root through Flow-1 and in octaves on the zoom-out; Issues gets a walking line instead.
    if (from < issues.leadIn.at || finale(from)) {
      const celli: [number, number] = bloom ? [.45, .32] : last ? [.65, .42] : [arc(cues, from).celli, arc(cues, next - .02).celli];
      for (const midi of finale(from) ? [chord.bass, chord.bass + 12] : [chord.bass])
        bowed(mix, from, to, midi, DRONE, {section: 'celli', dynamics: celli, attack: bloom ? .04 : .25, release: last ? 2.2 : .6, level: finale(from) ? .6 * FINALE : .6, bright: .4});
    }
  });

  // Issues: celli half notes, root then fifth; the clusters: legato quarters, root, fifth, octave, fifth.
  const line = (from: number, to: number, beats: number, shape: readonly number[]) => {
    for (const {time, index} of grid.steps(from, to, 1 / beats)) {
      const chord = chordAt(plan, time + .001), k = ((Math.round(index / beats) % shape.length) + shape.length) % shape.length;
      const [at, dyn] = humanize(mix, time, arc(cues, time).celli);
      bowed(mix, at, time + BEAT * beats + .05, chord.bass + shape[k], DRONE, {section: 'celli', dynamics: [dyn, dyn * .9], attack: .08, release: .25, level: .6, bright: .4, offset: .08});
    }
  };
  line(issues.leadIn.at - .2, issues.native, 2, [0, 7]);
  line(issues.native, conclusion.start - .01, 1, [0, 7, 12, 7]);

  // Soft timpani only where the harmony lands: the cover, "It clusters issues", the zoom-out and the logo.
  timpani(mix, reveal, 45, .16, DRUM, {decay: 1.6});
  timpani(mix, flow.coverShut, 45, .15, DRUM, {decay: 1.6});
  timpani(mix, issues.native, 45, .15, DRUM, {decay: 1.6});
  timpani(mix, conclusion.start, 38, .1, DRUM, {decay: 1.8});
  roll(mix, logo - BAR * .5, logo - .03, 40, [.02, .07], DRUM);
  timpani(mix, logo, 45, .24, DRUM, {decay: 2.2});
  for (const time of [reveal, logo]) [0, 1, 2, 3, 4, 5].forEach(k => pizz(mix, time + k * .07, toneOf(chordAt(plan, time + .001), k, time === logo ? 69 : 64), .18, {...DROP, pan: -.4 + k * .16}, {length: 1}));

  // The theme: the violin section, swelling in under speech and speaking in the gaps.
  const notes = theme(cues);
  notes.forEach(([at, midi], i) => {
    const final = i === notes.length - 1, until = final ? end - .3 : notes[i + 1][0] + .06;
    const soft = speaking(cues, at + .2, .1), {speech, gap} = arc(cues, at);
    const level = soft ? speech : gap, fall: number = final ? .42 : level * .92;
    bowed(mix, at, until, midi, THEME, {section: 'violins', dynamics: [level, fall], attack: soft ? .4 : .15, release: final ? 2.2 : .3, level: finale(at) ? .45 * FINALE : .45, bright: .42});
    // On the zoom-out the seconds double the theme an octave below.
    if (finale(at)) bowed(mix, at, until, midi - 12, SECONDS, {section: 'violins', dynamics: [level * .9, fall * .9], attack: soft ? .4 : .15, release: final ? 2.2 : .3, level: .38 * FINALE, bright: .4});
  });
  // After "with Laminar." the firsts open up to E6 over the held C♯6.
  const lastWord = cues.voice.at(-1), lift = lastWord ? lastWord.at + lastWord.duration + .07 : logo + 1.1;
  if (lift < end - 1) bowed(mix, lift, end - .2, 88, THEME, {section: 'violins', dynamics: [.3, .42], attack: .8, release: 2.2, level: .4 * FINALE, bright: .42});
}

/** The problem half's foley as in primavera-ambient; after the reveal only rising, sparse gestures remain. */
export function designPrimaveraDawn(mix: Mix, cues: ScoreCues) {
  const plan = dawnPlan(cues), {flow, issues} = cues, {tone, pluck, lift} = foleyKit(mix, plan);
  problemFoley(mix, cues, plan);
  lift(flow.cameraZoom, true);
  lift(flow.cameraToEngine, true);
  radialPops(cues).forEach((pop, i) => { if (i % 6 === 0) pizz(mix, pop.at, tone(pop.at, Math.round(pop.height * 6), 76), .06, {...DROP, bus: 'sfx', pan: pop.pan}, {length: .5}); });
  lift(issues.travel, true);
  pluck(issues.issueBadge, 2, .14, .3, 76);
  pluck(issues.queryBadge, 3, .14, .3, 76);
}
