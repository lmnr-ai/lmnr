import type {ScoreCues} from '../cues';
import {OnePole} from '../dsp';
import {bass, bell, hat, impact, kick, pluck, pop, puff, reverseSwell, riser, shaker, snare, thock, tick, whoosh, type Mix, type Route} from '../voices';
import {cascade} from '../writing';
import {air, drone, glint, haze, keys, shimmer, thump} from './instruments';

/*
 * "Glide 2 · continuous arc" — the Glide palette rewritten as one piece instead of ambience plus reactions.
 * One 89.5 BPM grid runs the whole film, anchored so the Flow-1 reveal is bar 0 and the logo bar 14. The arc:
 * problem (a soft ostinato that stumbles on the failure; a muffled boom-bap pulse under Cost that tape-stops
 * on the depletion) → turn (true silence, then V → I into the reveal) → solution (a motor that starts on the
 * reveal and never stops, gaining a layer every few bars) → scale (the kit arrives with Signals, breaks down
 * over the zoom-out and drops on the grid) → payoff (the groove, IV–V–I onto the logo) → a two-note button.
 * Tonal layers ride one slow filter; the kit is emitted after it so its top end stays crisp.
 */

const PAD: Route = {bus: 'music', hall: .4};
const MOTOR: Route = {bus: 'music', hall: .22, delay: .16, gain: .8};
const SUB: Route = {bus: 'music'};
const KIT: Route = {bus: 'music', room: .16, gain: .7};
const FELT: Route = {bus: 'music', room: .2};
const COMP: Route = {bus: 'music', hall: .25, delay: .18};
const FX: Route = {bus: 'sfx', hall: .25};
const SPECK: Route = {bus: 'sfx', hall: .4, delay: .2};

const up = (notes: readonly number[]) => notes.map(midi => midi + 12);
const Gmaj9 = up([55, 59, 62, 66, 69]), Em9 = up([52, 55, 59, 62, 66]), Cmaj9 = up([52, 55, 59, 62, 64]), Dsus = up([50, 55, 57, 62, 66]);
const Am9 = up([57, 60, 64, 67, 71]), Fmaj7s11 = up([53, 57, 60, 64, 71]), E7sus = up([52, 57, 59, 62, 64]), Bbmaj7 = up([50, 53, 57, 62]);
const Am11 = up([57, 60, 62, 67, 71]), GoverB = up([47, 55, 59, 62, 67]), Gwarm = [55, 62, 66, 71, 74];
/** Ostinato cells: chord tones inside G4–G5, walked up and back in 8ths. */
const CELLS = new Map<readonly number[], readonly number[]>([
  [Gmaj9, [67, 71, 74, 78, 74, 71]], [Em9, [67, 71, 74, 76, 74, 71]], [Cmaj9, [67, 71, 72, 76, 72, 71]],
  [Dsus, [67, 69, 74, 78, 74, 69]], [Am11, [67, 69, 72, 76, 72, 69]], [GoverB, [67, 71, 74, 79, 74, 71]],
]);
/** Glint scale: G-major pentatonic from D8 up, above the voice's presence band. */
const SPECKS = [110, 112, 115, 117, 119, 122, 124, 127];

/** Beat n counts from the Flow-1 reveal; the logo is beat 56 (bar 14). Negative beats score the problem. */
export const arcGrid = (cues: ScoreCues) => {
  const origin = cues.flow.reveal, beat = (cues.conclusion.logo - origin) / 56;
  const at = (n: number) => origin + n * beat;
  return {beat, at, bar: (k: number) => at(4 * k), sixteenth: beat / 4};
};

type Knot = readonly [time: number, value: number];
/** Log-linear through the knots, clamped at both ends. */
const automation = (knots: readonly Knot[]) => (time: number) => {
  if (time <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (time <= knots[i][0]) {
    const [t0, v0] = knots[i - 1], [t1, v1] = knots[i];
    return v0 * (v1 / v0) ** ((time - t0) / Math.max(1e-6, t1 - t0));
  }
  return knots[knots.length - 1][1];
};

/**
 * The bed's level against the voice, in dB relative to the bed's overall trim, interpolated linearly: the problem sits back, the solution
 * leans in, the payoff under n22 is the loudest, and the tagline clears the air. Applied by the bed builder.
 */
export const arcLevels = (cues: ScoreCues): readonly Knot[] => {
  const {bar} = arcGrid(cues);
  return [[0, -1.5], [bar(-4), -1.5], [bar(-3.5), -1], [bar(0) - .1, -1], [bar(0) + .3, 0], [bar(10), 0], [bar(10.25), .5],
    [bar(12.5), .5], [bar(12.75), 1], [cues.conclusion.logo, 1], [cues.conclusion.logo + .12, -3]];
};

export function composeArc(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, end = cues.conclusion;
  const {beat, at, bar} = arcGrid(cues);
  const swing = (sixteenth: number) => at(sixteenth / 4 + (((sixteenth % 2) + 2) % 2 ? .06 : 0));
  /** 16ths from `from` to `to` (in beats), `hit(step, s, time)` per step; `step` is the position in the bar. */
  const steps = (from: number, to: number, hit: (step: number, s: number, time: number) => void) => {
    for (let s = Math.round(from * 4); s < Math.round(to * 4); s++) hit(((s % 16) + 16) % 16, s, swing(s));
  };
  const ostinato = (from: number, to: number, cell: readonly number[], velocity: number) => {
    for (let e = Math.round(from * 2), i = 0; e < Math.round(to * 2); e++, i++) {
      const time = swing(e * 2), midi = cell[i % cell.length];
      pluck(mix, time, midi, velocity * (e % 2 ? .78 : 1), {...MOTOR, pan: i % 2 ? .45 : -.45}, {decay: .22, bright: .3});
    }
  };

  // ---------------- The problem (before the reveal): tonal layers first, filtered by the problem's curve.
  const B = (k: number) => 4 * k; // bar k in beats
  haze(mix, 0, bar(-8), Gmaj9, PAD, {attack: 1.8, release: 1.4, level: 1, coherent: true});
  ostinato(B(-10), (u2.failure - at(0)) / beat - .25, CELLS.get(Gmaj9)!, .2);
  haze(mix, bar(-8), bar(-7), Em9, PAD, {attack: .8, release: 1.4, level: .95, coherent: true});
  ostinato(B(-8), B(-7), CELLS.get(Em9)!, .2);
  haze(mix, bar(-7), bar(-5), Cmaj9, PAD, {attack: 1, release: 1.6, level: 1, coherent: true});
  ostinato(B(-7), B(-5), CELLS.get(Cmaj9)!, .22);
  haze(mix, bar(-5), bar(-4) + .3, Dsus, PAD, {attack: 1, release: 1.4, level: .9, coherent: true});
  ostinato(B(-5), (u2.ifOnly - at(0)) / beat - .5, CELLS.get(Dsus)!, .2);
  // The floor arrives with the insights and never leaves until the depletion.
  drone(mix, bar(-7), bar(-5), 36, SUB, {level: .045, attack: 1.2, release: .5});
  drone(mix, bar(-5), bar(-4), 38, SUB, {level: .04, attack: .4, release: .4});
  // Cost: dark and thin, sub on A → F → E → B♭.
  haze(mix, bar(-4), bar(-3), Am9, PAD, {attack: .6, release: .8, level: .75, tone: 1700, coherent: true});
  haze(mix, bar(-3), bar(-2), Fmaj7s11, PAD, {attack: .3, release: .8, level: .72, tone: 1600, coherent: true});
  haze(mix, bar(-2), bar(-1), E7sus, PAD, {attack: .3, release: .6, level: .7, tone: 1500, coherent: true});
  haze(mix, bar(-1), bar(-1) + cost.depletion.duration, Bbmaj7, PAD, {attack: .1, release: .5, level: .6, tone: 1200, coherent: true});
  drone(mix, bar(-4), bar(-3), 33, SUB, {level: .06, attack: .5});
  drone(mix, bar(-3), bar(-2), 29, SUB, {level: .065, attack: .1});
  drone(mix, bar(-2), bar(-1), 28, SUB, {level: .06, attack: .1});
  drone(mix, bar(-1), bar(-1) + cost.depletion.duration, 34, SUB, {level: .06, attack: .05, release: .3});
  mix.sweep(automation([[0, 1500], [u2.failure, 1500], [u2.failure + beat, 900], [u2.zoom.at + u2.zoom.duration, 5000], [bar(-4), 1200], [bar(-1), 1100]]));

  // Cost's pulse: the boom-bap kick pattern on muffled thumps, shaker from the second bar. Unfiltered.
  steps(B(-4), B(-1), (step, s) => {
    const time = swing(s), second = s >= B(-3) * 4;
    if (step === 0 || step === 10 || (step === 7 && second)) thump(mix, time, step === 0 ? .8 : .55, FELT, step === 0 ? .9 : 1);
    if (step === 4 || step === 12) thump(mix, time, .28, FELT, 1.5);
    if (second) shaker(mix, time, [.3, .12, .22, .12][step % 4] * .8, {...KIT, pan: .2});
  });
  // The depletion: everything slows to a halt, then true silence into "Until now".
  mix.tapeStop(bar(-1), cost.depletion.duration);

  // ---------------- The turn, and the solution onwards (tonal layers, second filter curve).
  const pump = {origin: at(0), period: beat, depth: .18};
  reverseSwell(mix, at(0), beat * 1.1, [62, 66, 69, 74], {...PAD, gain: .55});
  const plan: [from: number, to: number, chord: readonly number[], root: number][] = [
    [0, 2, Gwarm, 43], [2, 3, Em9, 40], [3, 4, Cmaj9, 36], [4, 5, Dsus, 38],
    [5, 6, Em9, 40], [6, 7, Cmaj9, 36], [7, 8, GoverB, 35], [8, 9, Am11, 45], [9, 10, Dsus, 38],
    [10, 11, Gmaj9, 43], [11, 12, Em9, 40], [12, 12.5, Cmaj9, 36],
  ];
  const choke = [at(19), bar(5)] as const; // the cover shut: one beat of stop-time before Signals
  for (const [from, to, chord, root] of plan) {
    haze(mix, bar(from), bar(to), chord, PAD, {attack: from === 0 ? .15 : .4, release: 1, level: from >= 10 ? 1 : .95, tone: from === 0 ? 2200 : 2800, coherent: true, pump});
    for (let k = from; k < to; k++) {
      if (k === 12) continue; // the drop-out before the payoff
      const breakdown = k === 9;
      if (breakdown) { bass(mix, bar(k), root, 4 * beat - .1, .26, SUB, {drive: 1.4}); continue; }
      const velocity = k >= 10 ? .4 : .3;
      const hits: [number, number, number][] = [[0, root, 1.5 * beat], [10, root, .5 * beat], [14, root + 7, .22 * beat]];
      for (const [step, midi, length] of hits) {
        const time = swing(16 * k + step);
        if (time >= choke[0] && time < choke[1]) continue;
        if (bar(k) + step * beat / 4 < bar(to)) bass(mix, time, midi, length, velocity * (step ? .8 : 1), SUB, {glide: step ? 0 : -1, drive: 1.6});
      }
      if ((k >= 1 && k < 4) || (k >= 5 && k < 9) || k === 10 || k === 11) {
        const cell = CELLS.get(chord === Gwarm ? Gmaj9 : chord)!;
        ostinato(4 * k, 4 * k + (k === 4 ? 3 : 4), cell, .17);
      }
    }
  }
  // The engine's riser pulls into the Signals downbeat.
  riser(mix, bar(4) + beat, choke[0], {...PAD, gain: .8}, {level: .045, fromMidi: 55, toMidi: 67});
  // The drop-out before the payoff: pads suck back, a reversed breath lands on beat 50.
  reverseSwell(mix, at(50), beat * 1.2, [55, 59, 66, 69], {...PAD, gain: .55});
  // Payoff: Cmaj9 → Dsus → Gmaj9 on the logo (IV–V–I).
  const payoff: [number, number, readonly number[], number][] = [[50, 52, Cmaj9, 36], [52, 56, Dsus, 38]];
  for (const [from, to, chord, root] of payoff) {
    haze(mix, at(from), at(to), chord, PAD, {attack: .2, release: 1, level: .85, tone: 3000, coherent: true, pump});
    bass(mix, at(from), root, 1.5 * beat, .4, SUB, {glide: -1.5, drive: 1.6});
    bass(mix, swing(4 * from + 10), root, .5 * beat, .3, SUB, {drive: 1.6});
    if (to - from >= 4) bass(mix, at(from + 2.5), root, beat * 1.3, .3, SUB, {drive: 1.6});
    keys(mix, at(from), chord.slice(1), .28, COMP, 1.1);
    keys(mix, swing(4 * from + 6), chord.slice(2), .18, COMP, .7);
  }
  haze(mix, end.logo, end.end, Gmaj9, PAD, {attack: .05, release: 1.2, level: .6, tone: 2200, coherent: true});
  bass(mix, end.logo, 31, beat * 1.5, .26, SUB, {drive: 1.3});
  // The button: two notes after the tagline, "La-mi", into the hall.
  bell(mix, at(58), 86, .2, {...COMP, pan: -.15}, {decay: .45, ratio: 1, index: .6});
  bell(mix, at(58.5), 91, .17, {...COMP, pan: .15}, {decay: .5, ratio: 1, index: .6});

  // Before the turn the problem's curve already applied, and the tape stop left silence.
  const turn = bar(-1) + cost.depletion.duration;
  mix.sweep(time => time < turn ? 20_000 : automation([
    [at(0) - beat, 300], [at(0), 2400], [bar(9), 1800], [bar(10), 9000], [bar(12), 9000], [at(49), 600], [at(50) - .02, 3000], [at(50), 20_000],
  ])(time));

  // ---------------- The kit, unfiltered, layered in on bar lines.
  steps(0, 50, (step, s, time) => {
    const k = Math.floor(s / 16);
    if (time >= choke[0] && time < choke[1]) return;
    const kitRunning = k >= 5 && k !== 9;
    if (k < 12) shaker(mix, time, [.3, .12, .22, .12][step % 4] * (k === 9 ? .7 : 1), {...KIT, pan: .2});
    if (k < 5 && (step === 0 || step === 10)) thump(mix, time, step ? .5 : .7, FELT, step ? 1 : .9);
    if (kitRunning && k < 12 && (step === 0 || step === 10 || step === 7)) kick(mix, time, (k >= 10 ? .7 : .5) * (step === 0 ? 1 : .8), KIT);
    if (k >= 5 && k < 9 && step === 12) snare(mix, time, .25, KIT, 0);
    if (k >= 10 && k < 12 && (step === 4 || step === 12)) snare(mix, time, .4, KIT, .3);
    if (k >= 3 && k < 12 && step % 2 === 0) hat(mix, time, (step % 4 === 0 ? .45 : .3) * (k === 9 ? .7 : 1), {...KIT, pan: .18}, .024);
    if (k >= 10 && k < 12 && step % 2 === 1) hat(mix, time, .2, {...KIT, pan: .18}, .018);
  });
  // The breakdown's snare roll into the drop (the last two beats of bar 9).
  for (let s = 0; s < 8; s++) snare(mix, bar(10) - 2 * beat + s * beat / 4, .1 + .3 * (s / 7) ** 1.5, KIT, .3);
  // The payoff groove from beat 50 to the logo, with a fill on the last beat.
  steps(50, 56, (step, s, time) => {
    const late = s >= 52 * 4;
    if (step === 0 || step === 10 || (step === 7 && late)) kick(mix, time, step === 0 ? .8 : .55, KIT);
    if (step === 4 || step === 12) snare(mix, time, .5, KIT, .35);
    if (step % 2 === 0) hat(mix, time, step % 4 === 0 ? .6 : .42, {...KIT, pan: .18}, .024);
    else if (step === 15 || step === 11) hat(mix, time, .26, {...KIT, pan: .18}, .02);
    if (step === 14 && !late) hat(mix, time, .4, {...KIT, pan: -.2}, .12);
    shaker(mix, time, [.26, .1, .18, .1][step % 4], {...KIT, pan: -.25});
  });
  for (let s = 1; s < 4; s++) snare(mix, at(55) + s * beat / 4, .18 + .08 * s, KIT, .35);
  kick(mix, end.logo, .75, KIT);
  impact(mix, end.logo, .3, SUB);

  // Everything under 150 Hz in mono, so the floor survives phones and a fold-down.
  const lows = [OnePole.lowpass(150), OnePole.lowpass(150)];
  for (let n = 0; n < mix.length; n++) {
    const l = lows[0].process(mix.music.l[n]), r = lows[1].process(mix.music.r[n]), mono = (l + r) / 2;
    mix.music.l[n] += mono - l; mix.music.r[n] += mono - r;
  }
}

export function designArc(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues;
  const cmp = flow.comparison;
  const {at, sixteenth} = arcGrid(cues);
  /** Foley within 40 ms of a 16th snaps onto it; anything further keeps its picture sync. */
  const snap = (time: number) => { const grid = at(Math.round((time - at(0)) / sixteenth) / 4); return Math.abs(grid - time) <= .04 ? grid : time; };
  const speck = (time: number, index: number, velocity: number, pan = 0, decay = .05) => glint(mix, snap(time), SPECKS[Math.max(0, Math.min(SPECKS.length - 1, index))], velocity, {...SPECK, pan}, decay);
  /** A stream of specks on the 16th (or 32nd) grid, thinned deterministically, panned with the picture. */
  const stream = (start: number, endAt: number, velocity: number, panFrom: number, panTo: number, every = 1, division = 4) => {
    const step = sixteenth * 4 / division;
    for (let n = Math.ceil((start - at(0)) / step), i = 0; at(0) + n * step < endAt; n++, i++) {
      if (i % every) continue;
      const time = at(0) + n * step, p = (time - start) / Math.max(.01, endAt - start);
      speck(time, [0, 2, 1, 3, 2, 4][i % 6] + Math.round(p * 3), velocity * (i % 4 ? .7 : 1), panFrom + (panTo - panFrom) * p, .025);
    }
  };

  // --- The problem
  speck(u2.agentEnter + .05, 4, .45, -.2, .12);
  stream(u2.stream.at, u2.failure - .05, .32, -.6, .6, 2);
  thump(mix, u2.failure, .8, {bus: 'sfx', room: .25}, .9);
  puff(mix, u2.failure + .02, .4, FX, 500);
  u2.drawers.forEach((time, i) => speck(time, 2 + i * 2, .45, -.3 + i * .3, .09));
  [0, 2, 4, 6].forEach((index, i) => speck(u2.insights + i * sixteenth / 2, index, .4 - i * .05, -.4 + i * .27, .12));
  whoosh(mix, u2.zoom.at, u2.zoom.duration, FX, {from: 250, to: 1800, level: .09, peak: .8, air: .6});
  stream(u2.zoom.at + u2.zoom.duration * .5, u2.zoom.at + u2.zoom.duration, .26, -.5, .5, 1);
  speck(u2.ifOnly, 6, .35, 0, .3);
  whoosh(mix, cost.cloudOut.at, cost.cloudOut.duration, FX, {from: 900, to: 300, level: .08, air: .5, panFrom: -.2, panTo: .4});
  // The cheap-LLM legs flick across as speck runs, panned with their direction.
  cost.cheapLegs.forEach(leg => [0, 1, 2].forEach(i => speck(leg.at + i * leg.duration / 3, 1 + i, .28, (leg.direction === 'leftToRight' ? -1 : 1) * (.6 - i * .6), .03)));
  speck(cost.missIssues, 3, .35, 0, .2);
  tick(mix, snap(cost.bashStop), 112, .26, SPECK);
  impact(mix, cost.powerful, .2, {bus: 'sfx', room: .25});
  for (let i = 0; i < 8; i++) speck(cost.bashDescent.at + i * cost.bashDescent.duration / 8, 7 - i, .22, .3 - i * .08, .03);
  speck(cost.budgetAppear, 5, .35, 0, .12);
  for (let time = snap(cost.budgetRun.at), i = 0; time < cost.budgetRun.at + cost.budgetRun.duration; time += sixteenth / 2, i++) tick(mix, time, 112 + (i % 5), .15, SPECK, .008);

  // --- The solution
  impact(mix, flow.reveal, .36, {bus: 'sfx', room: .25});
  for (let time = snap(flow.countUp.at), i = 0; time < flow.countUp.at + flow.countUp.duration; time += sixteenth / 2, i++) tick(mix, time, 110 + Math.min(9, i >> 1), .13, SPECK, .008);
  speck(flow.benchmark, 6, .3, 0, .15);
  // Flow-1's number lands as light, not a mid-range chord under "surpassing GPT-6".
  [0, 2, 4, 5].forEach((index, i) => speck(flow.numberDrops[2] + i * .03, index, .34 - i * .04, -.3 + i * .2, .3));
  if (cmp) {
    const orange = cmp.comparison_orangeDots;
    for (let i = 0; i < 4; i++) speck(orange.at + i * orange.duration / 4, i % 3, .26, .45, .04);
    shimmer(mix, cmp.comparison_blueDots.at, cmp.comparison_blueDots.at + cmp.comparison_blueDots.duration, SPECKS.slice(2), SPECK, {level: .24, density: [24, 56]});
    [2, 4, 6, 7].forEach((index, i) => speck(cmp.comparison_flowNumber.at + i * .03, index, .32 - i * .04, -.3 + i * .2, .3));
    const back = cmp.comparison_returnToGrid;
    whoosh(mix, back.at, back.duration, FX, {from: 300, to: 1600, level: .08, peak: .75, air: .6, panFrom: -.3, panTo: .3});
  }
  [1, 3, 5].forEach((index, i) => speck(flow.moduleActivation + i * sixteenth, index, .3, -.2 + i * .2, .1));
  for (let time = snap(flow.engineSpinner.at), i = 0; time < flow.engineSpinner.at + flow.engineSpinner.duration; time += sixteenth, i++) tick(mix, time, 115 + (i % 2) * 2, .11, SPECK, .01);
  thock(mix, flow.coverShut, .38, FX, .8);

  // --- Signals and the issue grid
  const p = issues.prelude;
  tick(mix, snap(p.bashStop), 112, .22, SPECK);
  for (let i = 0; i < 8; i++) speck(p.descent.at + i * p.descent.duration / 8, 7 - i, .2, .3 - i * .08, .03);
  if (p.bubble !== undefined) speck(p.bubble + .03, 6, .28, 0, .12);
  if (p.labels) for (let i = 0; i < 4; i++) speck(p.labels.at + i * p.labels.duration / 4, 3 + i, .22, -.3 + i * .2, .06);
  if (p.explanation) stream(p.explanation.at, p.explanation.at + p.explanation.duration, .16, -.2, .2, 2);
  shimmer(mix, p.circleGrow.at - .6, issues.native, SPECKS, SPECK, {level: .22, density: [6, 30]});
  for (const note of cascade(issues.pops, SPECKS.slice(1), .018)) speck(note.time, SPECKS.indexOf(note.midi), .24, note.pan, .07);
  whoosh(mix, issues.travel.at, issues.travel.duration, FX, {from: 500, to: 1200, level: .05, peak: .5, air: .6});
  speck(issues.ready, 4, .26, 0, .15);
  if (issues.clusters.length) [0, 2, 4, 6].forEach((index, i) => speck(issues.clusters[0] + i * .035, index, .3 - i * .03, -.3 + i * .2, .25));
  thock(mix, issues.windowShut, .32, FX);
  pop(mix, snap(issues.issueBadge), 86, .2, FX);
  speck(issues.messageSend, 5, .26, .3, .1);
  pop(mix, snap(issues.queryBadge), 88, .2, FX);
  whoosh(mix, issues.windowUp.at, issues.windowUp.duration, FX, {from: 400, to: 1300, level: .06});
  air(mix, cues.conclusion.logo - .7, cues.conclusion.end, FX, {hz: 6500, q: .5, level: .025, shape: q => Math.min(1, q * 4) * (1 - q)});
}
