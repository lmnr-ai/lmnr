import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import type {Mix, Route} from '../voices';
import {knock, mallet, paper, ratchet, sub, tapePad, type TapePadOptions} from './instruments';

/*
 * LAM-2317, after Cursor's "Software is changing". A♭ major, like the reference.
 *
 * - One warm tape-organ bed carries the film; events are paper knocks, mallets and tick ratchets on top.
 * - The first half has no bass: a high A♭maj9 cluster, a dry knock pulse for the agent that stops dead
 *   when it fails, and thin air before "Until now". The reference holds its bass until "What if…".
 * - Flow-1 is the bass entry: A♭ lands under the full bed, and the harmony then moves only with the
 *   camera — I, IV on the analysis move, V on the engine, vi/IV through the report, I on the clusters.
 * - The conclusion swells IV → V into a soft A♭maj9 bloom on the logo (no stab under "with Laminar").
 */

export const PAD: Route = {bus: 'music', hall: .22, room: .05};
export const BASS: Route = {bus: 'music', room: .02};
/** Knocks and mallets ride the foley bus, so the bed's breathing under the voice never dulls a hit. */
export const KNOCK: Route = {bus: 'sfx', room: .14, delay: .1};
export const TICK: Route = {bus: 'sfx', room: .1, gain: .8};
export const AIR: Route = {bus: 'sfx', room: .12, hall: .08};

// Pad voicings, low → high. Bass notes are separate so the first half can leave them out.
export const HIGH = [63, 67, 68, 70, 72]; // E♭4 G4 A♭4 B♭4 C5: the reference's opening cluster
export const I = [48, 55, 60, 63, 67, 70]; // A♭maj9 over A♭
export const IV = [53, 60, 63, 65, 68]; // D♭maj9 over D♭
export const V = [55, 58, 63, 65, 70]; // E♭add9 over E♭
export const vi = [56, 60, 63, 67]; // Fm9 over F
export const ivMinor = [56, 59, 61, 64]; // D♭m, borrowed: the cost section's shadow
export const PENTA = [63, 65, 68, 70, 72, 75, 77, 80]; // A♭ major pentatonic, E♭4 → A♭5
// The reference's pedals sit in 60–120 Hz; nothing sustained goes under D♭2.
const [Ab2, Db2, Eb2, F2] = [44, 37, 39, 41];

export function composeCursor(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, prelude = issues.prelude, end = cues.conclusion;
  const pad = (start: number, stop: number, notes: readonly number[], options: TapePadOptions = {}, route: Route = PAD) =>
    tapePad(mix, start, stop, notes, route, options);

  // ── This is the agent you've built: the high cluster breathes in; a knock for the agent, two ticks for its first thought.
  pad(u2.agentEnter, u2.failure + .05, HIGH, {attack: 1.6, release: .5, cutoff: [650, 1100], level: 1.1});
  knock(mix, u2.agentEnter + .02, 56, .5, {...KNOCK, pan: -.2}, {decay: .07});
  [0, .12].forEach((offset, i) => knock(mix, u2.firstThinking.at + offset, [75, 80][i], .2, {...TICK, pan: .1}, {decay: .02}));

  // ── Every time it runs, it leaves a trace: a dry paper pulse on the film's 120 BPM grid, low thump / wooden tick, left to right.
  for (let beat = Math.ceil(beatOf(cues, u2.stream.at, 4)), k = 0, time = gridOf(cues, beat); time < u2.failure - .05; k++, time = gridOf(cues, beat + k)) {
    const x = (time - u2.stream.at) / u2.stream.duration;
    knock(mix, time, k % 2 ? 44 : 32, k % 2 ? .32 : .55, {...KNOCK, pan: 0, delay: 0}, {decay: k % 2 ? .05 : .09, wood: .3, click: k % 2 ? .4 : .25});
    knock(mix, time + .25, [75, 72, 77, 75][k % 4], .14, {...TICK, pan: -.5 + x}, {decay: .018});
  }

  // ── When your agent fails: the pulse stops dead, the bed sags down a quarter-tone on the tape, one muffled knock.
  pad(u2.failure - .05, u2.upwardTurn.at + .3, HIGH, {attack: .05, release: .9, cutoff: [1000, 450], level: 1, bend: {at: .05, duration: .6, semitones: -.5}});
  knock(mix, u2.failure, 45, .45, {...KNOCK, pan: .1}, {decay: .11, wood: .15, click: .15});
  // The upward turn climbs three knocks; the backtrack is a paper slide; each drawer is a mallet, rising.
  [68, 72, 75].forEach((midi, i) => knock(mix, u2.upwardTurn.at + i * u2.upwardTurn.duration / 3, midi, .22 + i * .04, {...KNOCK, pan: -.1 + i * .1}, {decay: .04}));
  paper(mix, u2.backtrack.at, u2.backtrack.duration, AIR, {level: .28, from: 1200, to: 500, pan: [.4, -.4]});
  u2.drawers.forEach((time, i) => mallet(mix, time, [63, 67, 70][i], .5 + i * .05, {...KNOCK, pan: -.25 + i * .25}));
  mallet(mix, u2.highlight.at, 72, .38, {...KNOCK, pan: .2});
  // The warning is the only wrong note in the film: A♮ rubbing the bed's A♭, soft.
  mallet(mix, u2.warning, 69, .5, {...KNOCK, pan: .15}, .45);
  mallet(mix, u2.warning + .06, 80, .22, {...KNOCK, pan: .25}, .3);

  // ── The insights are hidden across thousands of traces: the bed opens onto vi, the zoom is a thousand small ticks.
  pad(u2.upwardTurn.at + .1, u2.insights + .2, HIGH, {attack: 1.2, release: 1, cutoff: [600, 900], level: 1});
  pad(u2.insights, u2.collapse.at + .1, vi, {attack: 1.1, release: .8, cutoff: [600, 1500], level: 1.2});
  paper(mix, u2.cloudIn.at, u2.cloudIn.duration, {...AIR, gain: .7}, {level: .16, from: 300, to: 800, peak: .5, pan: [-.5, .2], grain: .3});
  ratchet(mix, u2.zoom.at + .3, u2.collapse.at, PENTA, {...TICK, gain: .6}, {rate: [6, 18], level: [.05, .16], pan: [-.6, .6]});
  // The collapse: one heavy thump, the bed folds onto IV and thins out.
  knock(mix, u2.collapse.at + u2.collapse.duration * .8, 30, .7, {...KNOCK, pan: 0}, {decay: .14, wood: .1, click: .2, drop: 1.6});
  pad(u2.collapse.at + .05, u2.ifOnly + .4, IV, {attack: .5, release: 1.4, cutoff: [1100, 700], level: .85});
  // If only someone could read them all: two tones left hanging.
  pad(u2.ifOnly, cost.cheapLegs[0].at, [70, 75], {attack: .8, release: .6, cutoff: [900, 900], level: .7, breath: .3});

  // ── Cheap LLMs: the borrowed minor, dark and small; each quick pass is a flick of ticks in its direction.
  pad(cost.cloudOut.at + .3, cost.bashStop, ivMinor, {attack: 1, release: .6, cutoff: [500, 800], level: 1.1});
  paper(mix, cost.cloudOut.at, cost.cloudOut.duration * .6, AIR, {level: .16, from: 700, to: 300, pan: [.3, -.3], grain: .3});
  cost.cheapLegs.forEach(leg => {
    const ltr = leg.direction === 'leftToRight';
    ratchet(mix, leg.at, leg.at + leg.duration, ltr ? [75, 77, 80, 82] : [82, 80, 77, 75], TICK, {rate: [12, 12], level: [.16, .22], pan: ltr ? [-.5, .5] : [.5, -.5]});
  });
  // …fail to find crucial issues: a muffled knock that droops.
  knock(mix, cost.missIssues + .05, 67, .3, {...KNOCK, pan: 0}, {decay: .06, wood: .2});
  knock(mix, cost.missIssues + .3, 61, .3, {...KNOCK, pan: -.05}, {decay: .09, wood: .1, click: .15});
  // Powerful LLMs: the camera pushes down, the bash lands on the heaviest thump yet, and its descent walks down the scale.
  paper(mix, cost.cameraToBash.at, cost.cameraToBash.duration, AIR, {level: .3, from: 400, to: 1100, peak: .6, pan: [0, 0]});
  knock(mix, cost.bashStop, 32, .8, {...KNOCK, pan: 0}, {decay: .16, wood: .15, click: .3, drop: 1.4});
  pad(cost.bashStop, cost.depletion.at, [44, ...ivMinor], {attack: .08, release: .6, cutoff: [900, 600], level: .95});
  [80, 77, 75, 72, 70, 68].forEach((midi, i) => mallet(mix, cost.bashDescent.at + i * cost.bashDescent.duration / 6, midi, .22 - i * .015, {...KNOCK, pan: .3 - i * .1}, .2));
  mallet(mix, cost.bashWarning, 69, .42, {...KNOCK, pan: -.1}, .4);
  // The budget: the camera slides, then a counter ticks faster as it fills…
  paper(mix, cost.cameraToBudget.at, cost.cameraToBudget.duration, AIR, {level: .24, from: 500, to: 1000, pan: [0, 0]});
  mallet(mix, cost.budgetAppear, 75, .3, {...KNOCK, pan: .1});
  ratchet(mix, cost.budgetRun.at, cost.budgetRun.at + cost.budgetRun.duration, [70, 72, 75], TICK, {rate: [8, 20], level: [.1, .2]});
  // …but the costs are unsustainable: the bed slows off the tape a whole tone, and the ticks run down to nothing.
  pad(cost.depletion.at - .05, cost.depletion.at + cost.depletion.duration, [44, ...ivMinor], {attack: .05, release: .5, cutoff: [700, 300], level: .95, bend: {at: 0, duration: cost.depletion.duration, semitones: -2}});
  ratchet(mix, cost.depletion.at, cost.depletion.at + cost.depletion.duration * .9, [70, 68, 65, 63], TICK, {rate: [14, 3], level: [.18, .06]});

  // ── Until now: near silence. One E♭ is left in the air, the fifth of what is coming.
  const reveal = flow.reveal;
  pad(cost.depletion.at + cost.depletion.duration - .1, reveal - .02, [75], {attack: .4, release: .08, cutoff: [1200, 1200], level: .55, breath: 0});

  // ── Introducing Flow-1: the bass arrives. A♭ under the whole bed, opened, with one low knock.
  knock(mix, reveal, 32, .75, {...KNOCK, pan: 0, delay: .05}, {decay: .15, wood: .2, click: .35, drop: 1.2});
  sub(mix, reveal, flow.cameraToAnalysis.at + .1, Ab2, BASS, {attack: .06, release: 1, level: .95});
  pad(reveal, flow.cameraToAnalysis.at + .1, I, {attack: .12, release: 1.2, cutoff: [900, 1700], level: 1.1});
  pad(reveal, flow.cameraToAnalysis.at + .1, [75, 79, 80], {attack: 2.2, release: 1.2, cutoff: [1400, 1800], level: .45}, {...PAD, hall: .35});
  paper(mix, flow.entry.at, flow.entry.duration, AIR, {level: .25, from: 350, to: 900, peak: .8, pan: [0, 0]});
  paper(mix, flow.cameraZoom.at, flow.cameraZoom.duration + .3, AIR, {level: .2, from: 900, to: 400, pan: [.2, -.2]});
  knock(mix, flow.benchmark, 75, .2, {...TICK, pan: -.3}, {decay: .02});
  ratchet(mix, flow.countUp.at, flow.countUp.at + flow.countUp.duration, [72, 75, 77], TICK, {rate: [14, 22], level: [.08, .14], pan: [-.2, .2]});
  // The benchmark beads: each peer is a mallet in the scale; flow-1 (index 2) lands last, highest, on a low knock.
  flow.numberDrops.forEach((time, i) => {
    if (i === 2) {
      mallet(mix, time, 80, .55, {...KNOCK, pan: .2}, .5);
      mallet(mix, time + .004, 68, .35, {...KNOCK, pan: -.1}, .6);
      knock(mix, time, 44, .45, {...KNOCK, pan: 0}, {decay: .1, wood: .2, click: .2});
    } else mallet(mix, time, [70, 72, 0, 75, 77, 70][i], .3, {...KNOCK, pan: -.5 + i * .2}, .28);
  });

  // ── …20 times more traces per dollar: the camera move is the change to IV; the dense grid is a fast, wide ratchet.
  const toAnalysis = flow.cameraToAnalysis.at + flow.cameraToAnalysis.duration * .5;
  paper(mix, flow.cameraToAnalysis.at, flow.cameraToAnalysis.duration, AIR, {level: .28, from: 400, to: 1200, peak: .5, pan: [-.3, .3]});
  sub(mix, toAnalysis, flow.cameraToEngine.at + .1, Db2, BASS, {attack: .35, release: .9, level: .95});
  pad(toAnalysis, flow.cameraToEngine.at + .1, IV, {attack: .6, release: 1, cutoff: [1000, 1600], level: 1.05});
  ratchet(mix, flow.analysisCountUp.at, flow.analysisCountUp.at + flow.analysisCountUp.duration + .9, PENTA, {...TICK, gain: .7}, {rate: [10, 18], level: [.08, .13], pan: [-.7, .7]});
  mallet(mix, flow.analysisCountUp.at + flow.analysisCountUp.duration, 77, .3, {...KNOCK, pan: .3});

  // ── Flow-1 powers Signals: the descent into the engine is V; the module lights, the spinner winds up, the cover shuts.
  const engine = flow.cameraToEngine.at + flow.cameraToEngine.duration * .6;
  paper(mix, flow.cameraToEngine.at, flow.cameraToEngine.duration, AIR, {level: .2, from: 1100, to: 350, peak: .4, pan: [0, 0]});
  sub(mix, engine, flow.coverShut, Eb2, BASS, {attack: .15, release: .5, level: 1});
  pad(engine, flow.coverShut + .1, V, {attack: .3, release: 1.1, cutoff: [900, 1500], level: 1.05});
  [63, 70, 75].forEach((midi, i) => mallet(mix, flow.moduleActivation + i * .03, midi, .3, {...KNOCK, pan: -.2 + i * .2}, .45));
  ratchet(mix, flow.engineSpinner.at, flow.engineSpinner.at + flow.engineSpinner.duration, [75, 77, 80], TICK, {rate: [6, 20], level: [.08, .16], pan: [-.3, .3]});
  knock(mix, flow.coverShut, 34, .75, {...KNOCK, pan: 0}, {decay: .13, wood: .3, click: .35, drop: 1.2});

  // ── It finds deep issues and reports them: Fm under the analysis, the agent's knocks, then IV for the report.
  const report = prelude.bubble ?? prelude.highlight;
  sub(mix, flow.coverShut + .1, report, F2, BASS, {attack: .9, release: 1.2, level: .75});
  pad(flow.coverShut + .1, report + .2, vi, {attack: 1.4, release: 1.2, cutoff: [600, 1200], level: .95});
  knock(mix, prelude.bashStop, 44, .4, {...KNOCK, pan: -.1}, {decay: .08});
  [77, 75, 72, 70, 68].forEach((midi, i) => mallet(mix, prelude.descent.at + i * prelude.descent.duration / 5, midi, .2, {...KNOCK, pan: .3 - i * .12}, .2));
  mallet(mix, prelude.highlight, 72, .3, {...KNOCK, pan: .1});
  const zoomOut = prelude.zoomOut.at;
  sub(mix, report, zoomOut + .1, Db2, BASS, {attack: .7, release: 1, level: .8});
  pad(report, zoomOut + .1, IV, {attack: .9, release: 1.2, cutoff: [800, 1300], level: 1});
  if (prelude.bubble !== undefined) mallet(mix, prelude.bubble, 75, .32, {...KNOCK, pan: -.2}, .35);
  if (prelude.labels) [70, 72, 75].forEach((midi, i) => mallet(mix, prelude.labels!.at + i * prelude.labels!.duration / 3, midi, .24, {...KNOCK, pan: -.3 + i * .3}, .22));
  // …with any structure you define: the explanation types as fine paper ticks.
  if (prelude.explanation) ratchet(mix, prelude.explanation.at, prelude.explanation.at + prelude.explanation.duration, [77, 75, 80, 72], TICK, {rate: [11, 11], level: [.09, .09], pan: [-.2, .2]});

  // ── Across every trace: the zoom out is V; the circle's growth is a rising ratchet, sucked into the grid.
  paper(mix, zoomOut, prelude.zoomOut.duration, AIR, {level: .28, from: 1000, to: 350, peak: .35, pan: [.3, -.3]});
  sub(mix, zoomOut + .3, issues.native, Eb2, BASS, {attack: .8, release: .4, level: .85});
  pad(zoomOut + .3, issues.native, V, {attack: 1, release: .5, cutoff: [700, 1500], level: 1});
  knock(mix, prelude.collapse, 40, .45, {...KNOCK, pan: 0}, {decay: .1});
  ratchet(mix, prelude.circleGrow.at, issues.native - .03, PENTA, {...TICK, gain: .7}, {rate: [5, 20], level: [.05, .15], pan: [0, 0]});

  // ── It clusters issues into high-level patterns: the grid lands on I. Its 47 triangles are a cascade of mallets;
  //    as the clusters form the bed holds, and each lock is one of the six chord tones.
  const native = issues.native;
  knock(mix, native, 32, .7, {...KNOCK, pan: 0}, {decay: .15, wood: .2, click: .3, drop: 1.3});
  const conclusion = end.start;
  sub(mix, native, conclusion + .1, Ab2, BASS, {attack: .05, release: 1, level: .95});
  pad(native, conclusion + .1, I, {attack: .1, release: 1.2, cutoff: [1000, 1500], level: 1.05});
  const seen = new Set<number>();
  issues.pops.forEach((pop, i) => {
    const midi = PENTA[Math.min(PENTA.length - 1, Math.floor(pop.height * PENTA.length))];
    if (seen.has(midi) && i % 3) return;
    seen.add(midi);
    // Thin under "It clusters…": the cascade must not cover the phrase's short first word.
    mallet(mix, pop.at + i * .012, midi, .12 + .1 * pop.height, {...KNOCK, pan: pop.pan, gain: .45}, .22);
  });
  paper(mix, issues.travel.at, issues.travel.duration, {...AIR, gain: .7}, {level: .2, from: 350, to: 800, peak: .7, pan: [-.4, .4], grain: .4});
  issues.clusters.forEach((time, i) => mallet(mix, time + i * .05, [68, 72, 75, 79, 80, 84][i], .3, {...KNOCK, pan: -.6 + i * .24}, .5));

  // ── Unlock the insights: IV → V swells into the logo, where A♭maj9 blooms over the bass, softly.
  const logo = end.logo, half = conclusion + (logo - conclusion) * .5;
  sub(mix, conclusion, half + .05, Db2, BASS, {attack: .6, release: .4, level: .8});
  pad(conclusion, half + .1, IV, {attack: .8, release: .4, cutoff: [800, 1300], level: 1});
  sub(mix, half, logo, Eb2, BASS, {attack: .5, release: .2, level: .85});
  pad(half, logo + .03, V, {attack: .6, release: .15, cutoff: [900, 1800], level: 1.05});
  // The swell: the high cluster reversed into the logo, the reference's "hit play" rise.
  pad(logo - 1.6, logo, [70, 75, 79, 82], {attack: 1.6, release: .05, cutoff: [500, 2200], level: .45, curve: 2.4, breath: 0}, {...PAD, hall: .3});
  knock(mix, logo, 32, .5, {...KNOCK, pan: 0}, {decay: .16, wood: .15, click: .15, drop: 1.1});
  sub(mix, logo, end.end, Ab2, BASS, {attack: .25, release: 2, level: .9});
  pad(logo, end.end, [44, ...I, 75], {attack: .5, release: 2.5, cutoff: [1200, 700], level: .8});
  mallet(mix, logo + .02, 80, .3, {...KNOCK, pan: .15}, .9);
  mallet(mix, logo + .05, 75, .22, {...KNOCK, pan: -.15}, .9);
}
