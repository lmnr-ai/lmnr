import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import type {Mix, Route} from '../voices';
import {bassLine, bed, type BedKey} from './bed';
import {HIGH, I, IV, V, vi} from './composition';
import {knock, mallet, paper, ratchet, tapePad} from './instruments';

/*
 * LAM-2317 v2: the same A♭ palette as v1, rewritten from a sound designer's review of it.
 *
 * - One undercurrent: a single continuous bed and bass line (bed.ts) with E♭4 held as a pedal through
 *   every chord, so the film never drops out between harmonies.
 * - An arc: the bed gain follows the story (index.ts `macroCursorV2`). It's small in Act 1, rises
 *   through Cost, is near silent for "Until now", opens at Flow-1, swells into the clusters, and
 *   crescendos IV → V into a logo bloom that fully decays before the cut.
 * - Punctuation instead of mickey-mousing: v1's 249 hits are cut to the story beats, and the survivors play louder.
 */

export const PAD: Route = {bus: 'music', hall: .3, room: .05};
export const BASS: Route = {bus: 'music', room: .02};
// The survivors play ~3.5 dB louder than v1's, and every hit shares a touch of the bed's hall.
export const KNOCK: Route = {bus: 'sfx', room: .14, hall: .05, delay: .1, gain: 1.5};
export const TICK: Route = {bus: 'sfx', room: .1, hall: .05, gain: 1.1};
export const AIR: Route = {bus: 'sfx', room: .12, hall: .1};

// Cost's borrowed minor, voiced around the E♭ pedal: A♭ C♭ D♭ E♭.
const ivMinor = [56, 59, 61, 63];
// The logo: A♭maj9 with its top opened (E♭5 G5 A♭5) rather than a heavier low end.
const BLOOM = [48, 55, 60, 63, 67, 70, 75, 79, 80];
const PENTA = [63, 65, 68, 70, 72, 75, 77, 80];
const [Ab2, Db2, Eb2, F2] = [44, 37, 39, 41];

export function composeCursorV2(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, prelude = issues.prelude, end = cues.conclusion;
  const reveal = flow.reveal, toAnalysis = flow.cameraToAnalysis.at + flow.cameraToAnalysis.duration * .5;
  const engine = flow.cameraToEngine.at + flow.cameraToEngine.duration * .6, report = prelude.bubble ?? prelude.highlight;
  const native = issues.native, logo = end.logo, half = end.start + (logo - end.start) * .5;
  const silence = cost.depletion.at + cost.depletion.duration - .2;

  // ── The undercurrent: every harmony from v1, at the same times, as crossfades of one bed.
  const keys: BedKey[] = [
    {at: u2.agentEnter, notes: HIGH, fade: 2, cutoff: 750, level: 1, breath: .18},
    // The agent fails: the tape sags a quarter-tone and darkens, then recovers on the upward turn.
    {at: u2.failure, glide: .6, cutoff: 450, bend: -.5, bendTime: .6},
    {at: u2.upwardTurn.at, glide: 1, cutoff: 850, bend: 0, bendTime: 1},
    {at: u2.insights, notes: vi, fade: 2.2, cutoff: 1300, level: 1.15},
    {at: u2.collapse.at + .2, notes: IV, fade: 1.2, cutoff: 800, level: .9},
    {at: u2.ifOnly, notes: [63, 70, 75], fade: 1.6, cutoff: 900, level: .75, breath: .3},
    {at: cost.cloudOut.at + .3, notes: ivMinor, fade: 1.6, cutoff: 650, level: 1.05, breath: .18},
    {at: cost.bashStop, notes: [44, ...ivMinor], fade: .1, glide: .3, cutoff: 950},
    // Unsustainable: the tape slows a whole tone and darkens, and is gone before "Until now".
    {at: cost.depletion.at, glide: cost.depletion.duration, cutoff: 300, bend: -2, bendTime: cost.depletion.duration},
    {at: silence, notes: [], fade: .2},
    {at: silence + .25, notes: [75], fade: .5, glide: .01, cutoff: 1200, level: .3, bend: 0, bendTime: .01, breath: 0},
    // Introducing Flow-1: the full bed opens on the reveal, and its top fills in after it.
    {at: reveal, notes: [...I, 75], fade: .12, glide: .4, cutoff: 1700, level: 1.1, breath: .18},
    {at: reveal + .6, notes: [...I, 75, 79, 80], fade: 2.2},
    {at: toAnalysis - .4, notes: IV, fade: 1.6, glide: 1.6, cutoff: 1600, level: 1.05},
    {at: engine, notes: V, fade: .6, cutoff: 1500},
    {at: flow.coverShut + .1, notes: vi, fade: 1.6, cutoff: 1100, level: .95},
    {at: report, notes: IV, fade: 1.2, cutoff: 1200, level: 1},
    {at: prelude.zoomOut.at + .3, notes: V, fade: 1.4, cutoff: 1500},
    {at: native, notes: I, fade: .1, glide: .3, cutoff: 1600, level: 1.05},
    // The conclusion opens IV → V from 900 Hz to 2 kHz into the logo.
    {at: end.start, notes: IV, fade: 1, cutoff: 900, level: 1},
    {at: half, notes: V, fade: .8, glide: logo - half, cutoff: 2000, level: 1.05},
    {at: logo, notes: BLOOM, fade: .5, glide: .5, cutoff: 1500, level: .9},
    {at: logo + .8, glide: 1.6, cutoff: 700},
  ];
  bed(mix, keys, PAD);
  // The bass waits for Flow-1, as in v1, then walks without gaps. The logo bass is lighter so the bloom lifts.
  bassLine(mix, [
    {at: 0, midi: null, fade: .01, level: 0},
    {at: reveal, midi: Ab2, fade: .06, level: .95},
    {at: toAnalysis - .2, midi: Db2, fade: .8},
    {at: engine, midi: Eb2, fade: .3, level: 1},
    {at: flow.coverShut + .1, midi: F2, fade: 1, level: .75},
    {at: report, midi: Db2, fade: .8, level: .8},
    {at: prelude.zoomOut.at + .3, midi: Eb2, fade: .9, level: .85},
    {at: native, midi: Ab2, fade: .05, level: .95},
    {at: end.start, midi: Db2, fade: .7, level: .8},
    {at: half, midi: Eb2, fade: .6, level: .85},
    {at: logo, midi: Ab2, fade: .3, level: .6},
  ], BASS);

  // ── Act 1. A knock for the agent; its runs are a dry downbeat pulse on the 120 BPM grid that stops dead at the failure.
  knock(mix, u2.agentEnter + .02, 56, .5, {...KNOCK, pan: -.2}, {decay: .07});
  for (let beat = Math.ceil(beatOf(cues, u2.stream.at, 4)), k = 0, time = gridOf(cues, beat); time < u2.failure - .05; k++, time = gridOf(cues, beat + k))
    knock(mix, time, k % 2 ? 44 : 32, k % 2 ? .28 : .5, {...KNOCK, pan: 0, delay: 0}, {decay: k % 2 ? .05 : .09, wood: .3, click: k % 2 ? .4 : .25});
  knock(mix, u2.failure, 45, .5, {...KNOCK, pan: .1}, {decay: .12, wood: .15, click: .15});
  paper(mix, u2.backtrack.at, u2.backtrack.duration, AIR, {level: .24, from: 1200, to: 500, pan: [.4, -.4]});
  mallet(mix, u2.drawers[1], 67, .45, {...KNOCK, pan: 0});
  // The warning is the film's only wrong note: an A♮ against the bed's A♭.
  mallet(mix, u2.warning, 69, .5, {...KNOCK, pan: .15}, .45);
  paper(mix, u2.cloudIn.at, u2.cloudIn.duration, {...AIR, gain: .7}, {level: .14, from: 300, to: 800, peak: .5, pan: [-.5, .2], grain: .3});
  ratchet(mix, u2.zoom.at + .3, u2.collapse.at, PENTA, {...TICK, gain: .6}, {rate: [6, 16], level: [.04, .15], pan: [-.3, .3], human: true});
  knock(mix, u2.collapse.at + u2.collapse.duration * .8, 30, .7, {...KNOCK, pan: 0}, {decay: .16, wood: .1, click: .2, drop: 1.6});

  // ── Cost. One paper flick for the cheap passes; one drooping knock for the issues they miss; the bash lands on the heaviest thump.
  paper(mix, cost.cheapLegs[0].at, cost.cheapLegs.at(-1)!.at + cost.cheapLegs.at(-1)!.duration - cost.cheapLegs[0].at, AIR, {level: .18, from: 600, to: 1400, peak: .3, pan: [-.4, .4], grain: .5});
  knock(mix, cost.missIssues + .3, 61, .32, {...KNOCK, pan: -.05}, {decay: .09, wood: .1, click: .15});
  paper(mix, cost.cameraToBash.at, cost.cameraToBash.duration, AIR, {level: .26, from: 400, to: 1100, peak: .6, pan: [0, 0]});
  knock(mix, cost.bashStop, 32, .8, {...KNOCK, pan: 0}, {decay: .18, wood: .15, click: .3, drop: 1.4});
  [77, 72, 68].forEach((midi, i) => mallet(mix, cost.bashDescent.at + i * cost.bashDescent.duration / 3, midi, .22 - i * .02, {...KNOCK, pan: .25 - i * .25}, .25));
  paper(mix, cost.cameraToBudget.at, cost.cameraToBudget.duration, AIR, {level: .2, from: 500, to: 1000, pan: [0, 0]});
  // The budget runs down with the tape and stops before the bed does.
  ratchet(mix, cost.depletion.at, silence - .1, [70, 68, 65, 63], TICK, {rate: [14, 3], level: [.18, .05], human: true});

  // ── Flow-1. The reveal knock under the bass entry; Flow-1's own bead is the only one that sounds.
  knock(mix, reveal, 32, .75, {...KNOCK, pan: 0, delay: .05}, {decay: .16, wood: .2, click: .35, drop: 1.2});
  // Flow-1 enters under "Until now": a faint paper rise that peaks on the reveal.
  paper(mix, flow.entry.at, flow.entry.duration, AIR, {level: .1, from: 350, to: 900, peak: .95, pan: [0, 0]});
  paper(mix, flow.cameraZoom.at, flow.cameraZoom.duration + .3, AIR, {level: .16, from: 900, to: 400, pan: [.2, -.2]});
  const flowDrop = flow.numberDrops[2];
  mallet(mix, flowDrop, 80, .55, {...KNOCK, pan: .2}, .55);
  mallet(mix, flowDrop + .004, 68, .35, {...KNOCK, pan: -.1}, .6);
  knock(mix, flowDrop, 44, .45, {...KNOCK, pan: 0}, {decay: .1, wood: .2, click: .2});
  paper(mix, flow.cameraToAnalysis.at, flow.cameraToAnalysis.duration, AIR, {level: .24, from: 400, to: 1200, peak: .5, pan: [-.3, .3]});
  paper(mix, flow.cameraToEngine.at, flow.cameraToEngine.duration, AIR, {level: .18, from: 1100, to: 350, peak: .4, pan: [0, 0]});
  mallet(mix, flow.moduleActivation, 75, .32, {...KNOCK, pan: 0}, .45);
  knock(mix, flow.coverShut, 34, .75, {...KNOCK, pan: 0}, {decay: .14, wood: .3, click: .35, drop: 1.2});

  // ── Issues. The analysis lets the bed carry it; the zoom out rises as one long paper swell into the grid.
  if (prelude.bubble !== undefined) mallet(mix, prelude.bubble, 75, .3, {...KNOCK, pan: -.2}, .35);
  paper(mix, prelude.zoomOut.at, prelude.zoomOut.duration, AIR, {level: .24, from: 1000, to: 350, peak: .35, pan: [.3, -.3]});
  paper(mix, prelude.circleGrow.at, native - prelude.circleGrow.at - .02, AIR, {level: .2, from: 300, to: 1400, peak: .95, pan: [0, 0], grain: .3});
  knock(mix, native, 32, .75, {...KNOCK, pan: 0}, {decay: .16, wood: .2, click: .3, drop: 1.3});
  // A short cascade for the 47 triangles: the tallest eight only.
  [...issues.pops].sort((a, b) => b.height - a.height).slice(0, 8).sort((a, b) => a.at - b.at).forEach((pop, i) =>
    mallet(mix, pop.at + i * .03, PENTA[Math.min(PENTA.length - 1, Math.floor(pop.height * PENTA.length))], .12 + .1 * pop.height, {...KNOCK, pan: pop.pan, gain: .6}, .22));
  paper(mix, issues.travel.at, issues.travel.duration, {...AIR, gain: .7}, {level: .18, from: 350, to: 800, peak: .7, pan: [-.4, .4], grain: .4});
  issues.clusters.forEach((time, i) => mallet(mix, time + i * .05, [68, 72, 75, 79, 80, 84][i], .3, {...KNOCK, pan: -.6 + i * .24}, .5));

  // ── Logo. The high cluster swells in reverse into the bloom; one soft knock, two mallets, no stab under "with Laminar".
  tapePad(mix, logo - 1.6, logo, [70, 75, 79, 82], {...PAD, hall: .35}, {attack: 1.6, release: .05, cutoff: [500, 2200], level: .45, curve: 2.4, breath: 0});
  knock(mix, logo, 32, .5, {...KNOCK, pan: 0}, {decay: .16, wood: .15, click: .15, drop: 1.1});
  mallet(mix, logo + .02, 80, .3, {...KNOCK, pan: .15}, .9);
  mallet(mix, logo + .05, 75, .22, {...KNOCK, pan: -.15}, .9);
}
