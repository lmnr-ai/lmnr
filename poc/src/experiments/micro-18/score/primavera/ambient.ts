import type {ScoreCues} from '../cues';
import {chordAt, pulse, radialPops, speaking, toneOf, type Chord} from '../rounded';
import {bowed, pizz, type Mix, type Route} from '../voices';
import {humanize} from '../writing';

/*
 * Primavera ambient — the same spring light, held still so the voice stays in front. Long soft string
 * chords (add9 and major sevenths, E major rising to A major) change every two bars, a celli drone
 * holds the root, a faint high violin shimmers over the top, and sparse pizzicato droplets fall
 * through it. The solo violin only sings in the gaps between voice phrases; the level never moves.
 */

const BEAT = 60 / 120, BAR = BEAT * 4;
const PAD: Route = {bus: 'music', hall: .65, room: .03, pan: -.2};
const DRONE: Route = {bus: 'music', hall: .55, room: .04, pan: .25};
const AIR: Route = {bus: 'music', hall: .75, room: .02, pan: .35};
const SOLO: Route = {bus: 'music', hall: .6, room: .05, pan: .12};
// Plucks sit ~5 dB under the bowed bed: their transients, not the pads, would otherwise drive the limiter.
export const DROP: Route = {bus: 'music', gain: .55, hall: .6, room: .05};
const FX: Route = {bus: 'sfx', gain: .55, room: .08, hall: .55};

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
// E major
const EADD9 = v(40, 59, 64, 66, 68), AMAJ9 = v(33, 61, 64, 68, 71), CSM7 = v(37, 59, 64, 68, 73), BSUS = v(35, 59, 64, 66, 71);
const FSM9 = v(42, 61, 64, 68, 69), GSM7 = v(44, 59, 63, 66, 71), B = v(35, 59, 63, 66, 71), CMAJ7 = v(36, 59, 64, 67, 71), EMAJ9 = v(40, 59, 63, 66, 68);
// A major
const E7 = v(40, 59, 62, 64, 68), AADD9 = v(33, 59, 61, 64, 69), DMAJ7 = v(38, 61, 66, 69, 73), E = v(40, 59, 64, 68, 71);
const FMAJ7 = v(41, 60, 64, 69, 72), BM9 = v(35, 61, 62, 66, 69), DMAJ9 = v(38, 61, 64, 66, 69), FSM7 = v(42, 61, 64, 69, 73), A = v(33, 61, 64, 69, 73);

export function ambientPlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bars = pulse(flow.reveal, BAR * 2);
  const c = (at: number, voicing: Voicing): Chord => ({at, ...voicing});
  const loop = (from: number, to: number, cycle: readonly Voicing[]) =>
    [c(from, cycle[0]), ...bars.steps(from + BAR, to - BAR).map((s, i) => c(s.time, cycle[(i + 1) % cycle.length]))];
  return [
    ...loop(0, u2.failure, [EADD9, AMAJ9]), c(u2.failure, CSM7), c(u2.backtrack.at, AMAJ9), c(u2.warning, FSM9),
    ...loop(u2.insights, u2.ifOnly, [EADD9, CSM7, AMAJ9, BSUS]), c(u2.ifOnly, CMAJ7), c(cost.cloudOut.at - BAR, BSUS),
    ...loop(cost.cloudOut.at, cost.missIssues, [EADD9, GSM7]), c(cost.missIssues, CSM7),
    ...loop(cost.bashStop, cost.depletion.at, [AMAJ9, B, EADD9]), c(cost.depletion.at, EMAJ9), c(flow.entry.at - BAR * .5, E7),
    ...loop(flow.reveal, flow.coverShut, [AADD9, DMAJ7, FSM7, E]), c(flow.coverShut, FMAJ7),
    ...loop(issues.leadIn.at, issues.prelude.zoomOut.at, [FSM9, DMAJ9, BM9, E]), c(issues.prelude.zoomOut.at, DMAJ7), c(issues.prelude.zoomOut.at + BAR, E),
    ...loop(issues.native, conclusion.start, [AADD9, FSM7, DMAJ9, E]), c(conclusion.start, DMAJ7), c(conclusion.logo - BAR * .5, E), c(conclusion.logo, A),
  ].sort((a, b) => a.at - b.at);
}

/** A fixed 0–1 value per grid step: which off-beats get a droplet is composed, not seeded. */
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function composePrimaveraAmbient(mix: Mix, cues: ScoreCues) {
  const plan = ambientPlan(cues), {flow, conclusion} = cues;
  ambientLayers(mix, cues, plan, cues.duration);

  // "Until now.": a pizzicato arpeggio lifts into the A major bloom; the logo gets the same, higher.
  const arpeggio = (time: number, floor: number) => [0, 1, 2, 3, 4, 5].forEach(k => pizz(mix, time - .45 + k * .09, toneOf(chordAt(plan, time + .001), k, floor), .28, {...DROP, pan: -.4 + k * .16}, {length: 1}));
  arpeggio(flow.reveal, 64);
  arpeggio(conclusion.logo, 69);
}

/** The bed, droplets and gap-answering solo over `plan`, for chords and gaps that start before `until`. */
export function ambientLayers(mix: Mix, cues: ScoreCues, plan: readonly Chord[], until: number) {
  const {flow, conclusion} = cues, end = cues.duration;
  const grid = pulse(flow.reveal, BEAT);

  // The bed: every chord bowed softly from its start into the next, overlapping so the changes cross-fade.
  plan.forEach((chord, i) => {
    if (chord.at >= until) return;
    const from = Math.max(0, chord.at - .4), to = Math.min(end - .2, (plan[i + 1]?.at ?? end) + .6);
    if (to - from < .3) return;
    const bloom = chord.at >= flow.reveal - .01 && chord.at < flow.reveal + .01 || chord.at >= conclusion.logo - .01;
    const dyn: [number, number] = bloom ? [.32, .2] : [.18, .2];
    chord.pad.forEach((midi, k) => bowed(mix, from, to, midi, {...PAD, pan: -.5 + k * .33}, {section: 'violins', dynamics: dyn, attack: 1.6, release: 2, level: .42, bright: .35, offset: .1 * k}));
    bowed(mix, from, to, chord.bass < 36 ? chord.bass + 12 : chord.bass, DRONE, {section: 'celli', dynamics: [.2, .18], attack: 2, release: 2, level: .65, bright: .3});
    // The light on top: a high violin on the fifth or ninth, very soft, every other chord.
    if (i % 2 === 0 || bloom) bowed(mix, from + .8, to, toneOf(chord, 1, 83), AIR, {dynamics: [.12, .18], attack: 2.4, release: 2.4, level: .3, bright: .3});
  });

  // Droplets: a sparse high pizzicato on about a third of the off-beats, a little thicker between phrases.
  for (const {time, index} of grid.steps(.5, Math.min(until, end - 1.5), 2)) {
    const chance = speaking(cues, time, .2) ? .2 : .45;
    if (hash(index) > chance) continue;
    const chord = chordAt(plan, time + .001), midi = toneOf(chord, Math.floor(hash(index + 17) * 5), 76);
    const [at, velocity] = humanize(mix, time, .16 + .12 * hash(index + 9));
    pizz(mix, at, midi, velocity, {...DROP, pan: hash(index + 3) * 1.2 - .6}, {length: .8});
  }

  // The solo only answers the voice: a short rising phrase in each gap of 0.9 s or more.
  const spans = cues.voice, gaps: [number, number][] = [];
  spans.forEach((span, i) => { const next = spans[i + 1]?.at ?? end - .6; gaps.push([span.at + span.duration + .15, next - .15]); });
  if (spans.length) gaps.unshift([.4, spans[0].at - .15]);
  gaps.forEach(([from, to], g) => {
    const room = to - from;
    if (room < .9 || to > until) return;
    const notes = Math.min(4, Math.max(2, Math.floor(room / .45))), gap = room / notes;
    const shape = [[0, 1, 2, 3], [2, 1, 2, 4], [1, 2, 3, 2]][g % 3];
    for (let k = 0; k < notes; k++) {
      const at = from + k * gap, last = k === notes - 1;
      const midi = toneOf(chordAt(plan, at + .001), shape[k], 71);
      bowed(mix, at, at + (last ? gap + .6 : gap * .95), midi, SOLO, {dynamics: [.3, last ? .15 : .26], attack: .12, release: last ? 1.4 : .4, level: .45, bright: .4});
    }
  });
}

/** The picture gets only a few soft plucks; the voice and the bed carry it. */
export function designPrimaveraAmbient(mix: Mix, cues: ScoreCues, plan = ambientPlan(cues)) {
  const {ultimate2: u2, cost, flow, issues} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const pluck = (time: number, index: number, velocity: number, pan = 0, floor = 71) => pizz(mix, time, tone(time, index, floor), velocity, {...FX, pan}, {length: .7});
  const dyad = (time: number, velocity = .25, pan = 0) => { pluck(time, 0, velocity, pan, 64); pluck(time + .02, 2, velocity * .8, pan + .1, 76); };
  const lift = (span: {at: number; duration: number}, up: boolean, velocity = .18) => [0, 1, 2].forEach(k => pluck(span.at + Math.max(.3, span.duration) * (.4 + k * .2), up ? k + 1 : 3 - k, velocity, up ? -.3 + k * .3 : .3 - k * .3, 76));

  u2.blocks.forEach((block, i) => { if (i % 2 === 0) pluck(block.at, i % 5, .16, i % 4 ? .3 : -.3, 76); });
  dyad(u2.failure, .22);
  lift(u2.backtrack, false);
  dyad(u2.warning, .22, .2);
  lift(u2.zoom, false);
  lift(u2.cloudIn, true);

  lift(cost.cloudOut, false);
  dyad(cost.missIssues, .2);
  for (let i = 0; i < 4; i++) pluck(cost.bashDescent.at + i * cost.bashDescent.duration * .85 / 4, 3 - i, .15, (i - 1.5) * .2);
  dyad(cost.bashWarning, .22, .2);
  for (let t = cost.budgetRun.at, i = 0; t < cost.depletion.at; t += .2, i++) pluck(t, Math.max(0, 4 - i), .13, .3);

  lift(flow.cameraZoom, true);
  flow.numberDrops.forEach((time, i) => { if (i % 2 === 0) pluck(time, 4 - i, .16, -.4 + i * .2, 76); });
  lift(flow.cameraToAnalysis, true);
  lift(flow.cameraToEngine, true);
  dyad(flow.coverShut, .22);

  const {prelude} = issues;
  for (let i = 0; i < 4; i++) pluck(prelude.descent.at + i * prelude.descent.duration * .85 / 4, 3 - i, .14, (i - 1.5) * .2);
  lift(prelude.zoomOut, false);
  // 47 pops land inside 1.7 s: every fourth one, barely there.
  radialPops(cues).forEach((pop, i) => { if (i % 4 === 0) pizz(mix, pop.at, tone(pop.at, Math.round(pop.height * 6), 76), .08, {...FX, pan: pop.pan}, {length: .5}); });
  lift(issues.travel, true);
  dyad(issues.issueBadge, .2, .3);
  dyad(issues.queryBadge, .16, .3);
  lift(issues.windowUp, true);
}

