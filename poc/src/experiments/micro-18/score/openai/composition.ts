import type {ScoreCues} from '../cues';
import {db} from '../dsp';
import {keyClick, type Mix, type Route} from '../voices';
import {cascade} from '../writing';
import {air, glint, key, pressure, tick, whistle} from './instruments';

/*
 * "OpenAI pulse" — C♯ major pentatonic (C♯ D♯ F G♯ A♯), after OpenAI's "Get ready". A pure sine sub swells in, holds,
 * and is gated off into silence about every two seconds; soft keys walk 16th-note pentatonic cells over it; glass
 * partials and dry ticks sit on top of a faint air floor. Breakdowns drop the sub, builds shorten the pulses and
 * thicken the ticks, and every downbeat is preceded by a short suck-out of total silence. The sub sits on the
 * dominant (G♯) and relatives through Act 1 and Cost and only finds the tonic C♯ at Flow-1, the cover shut,
 * the issue grid and, longest and lowest (34.6 Hz), the logo.
 *
 * Every family is one named layer (OPENAI_LAYERS): `--layers` rescales it, `--solo` renders it as a stem.
 */

export const OPENAI_LAYERS = ['sub', 'keys', 'glass', 'ticks', 'air', 'lift', 'typing'] as const;
export type OpenaiLayer = typeof OPENAI_LAYERS[number];

type Chord = {root: number; tones: readonly number[]};
// Sub roots: C♯1 25, D♯1 27, F♯1 30, G♯1 32, A♯1 34. Tones are the keys' cell, low → high.
const I: Chord = {root: 25, tones: [61, 63, 65, 68, 73]};
const OPEN: Chord = {root: 32, tones: [51, 58, 63, 65, 70]};
const V: Chord = {root: 32, tones: [56, 63, 68, 70, 75]};
const vi: Chord = {root: 34, tones: [58, 61, 65, 70, 73]};
const IV: Chord = {root: 30, tones: [58, 61, 63, 68, 70]};
const ii: Chord = {root: 27, tones: [58, 63, 65, 70, 75]};
/** Glass register, C♯6 up. */
const GLASS = [85, 87, 89, 92, 94, 97, 99];
/** The film's only out-of-key note: a blue E for the warnings. */
const BLUE = 88;

const DENSE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const SPARSE = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const EIGHTHS = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
const WALK = [0, 2, 4, 1, 3, 2, 4, 1];
const SIXTEENTH = .125, BAR = 2;
/** The reference's gated sub: a ~40 ms swell, a flat hold, a 220 ms release and then silence until the next bar. */
const ATTACK = .04, RELEASE = .22, GAP = .3;

/** Silence windows before each downbeat: [drop, length]. Shared by the duck plan and the composition. */
export const suckOuts = (cues: ScoreCues): [number, number][] => {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues;
  return [[u2.failure, .2], [u2.collapse.at + u2.collapse.duration, .18], [cues.chapter.cost.start, .3], [cost.bashStop, .26],
    [flow.reveal, .23], [flow.cameraToEngine.at, .17], [flow.coverShut, .19], [issues.native, .2], [cues.conclusion.logo, .4]];
};

/** The bed breathes under the narration and swells back in the gaps; silences go to near zero just before a hit. */
export function duckOpenai(mix: Mix, cues: ScoreCues) {
  for (const phrase of cues.voice) mix.duck(phrase.at, db(-4.5), .08, phrase.duration, .3);
  for (const [drop, length] of suckOuts(cues)) mix.duck(drop - length + .03, .02, .03, length - .045, .015);
}

export function composeOpenai(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion, p = issues.prelude;
  const layer = (name: OpenaiLayer, route: Route): Route => ({...route, gain: (route.gain ?? 1) * mix.layer(name)});
  // The sub is the only part on the sfx bus: dry, mono and never ducked; its own gates make the silences.
  const SUB = layer('sub', {bus: 'sfx', gain: 1});
  const KEYS = layer('keys', {bus: 'music', gain: 1, room: .12, hall: .16, delay: .06});
  const GLASS_ROUTE = layer('glass', {bus: 'music', gain: 1, hall: .3, delay: .12});
  const TICKS = layer('ticks', {bus: 'music', gain: 1, room: .04});
  const AIR = layer('air', {bus: 'music', gain: 1});
  const LIFT = layer('lift', {bus: 'music', gain: 1, hall: .18});
  const TYPING = layer('typing', {bus: 'sfx', gain: 1, room: .04});
  const sucks = suckOuts(cues);
  /** The start of the silence before the next downbeat after `time`, or `limit`. */
  const before = (time: number, limit: number) => Math.min(limit, ...sucks.map(([drop, length]) => drop - length).filter(at => at > time + .05));

  // The voice ducks only move the music bus, so the sub steps back by itself under any line it overlaps.
  const spoken = (from: number, to: number) => cues.voice.some(phrase => phrase.at < to && phrase.at + phrase.duration > from);
  const hit = (time: number, root: number, hold: number, velocity: number, options: Parameters<typeof pressure>[6] = {}) =>
    pressure(mix, time, root, hold, velocity * (spoken(time, time + hold) ? db(-3) : 1), SUB, options);
  /** Gated sub bars from `from` until `to`: each holds for the bar minus the gap, the last one clipped to fit. */
  const pulse = (from: number, to: number, roots: readonly number[], velocity: number, period = BAR) => {
    for (let k = 0, at = from; at < to - .1; k++, at += period) {
      const hold = Math.min(at + period, to) - at - ATTACK - RELEASE - GAP;
      if (hold > .06) hit(at, roots[k % roots.length], hold, velocity * (k % 2 ? .92 : 1));
    }
  };
  /** Pulses that halve their period toward `to` — the reference's build into its last hit. */
  const accelerate = (from: number, to: number, root: number, velocity: number, period = BAR) => {
    for (let at = from, k = 0; at < to - .1 && period > .1; at += period, period /= 2, k++) {
      const hold = Math.max(.05, Math.min(at + period, to) - at - ATTACK - RELEASE - Math.min(GAP, period * .3));
      hit(at, root, hold, velocity * (1 + k * .06), {release: Math.min(RELEASE, period * .3)});
    }
  };

  let walk = 0;
  /** Soft keys walking a pentatonic cell on 16ths from `origin`; `chords` turns each bar. */
  const keys = (from: number, to: number, chords: readonly Chord[], velocity: number, options: {pattern?: readonly number[]; octave?: number; decay?: number; origin?: number} = {}) => {
    const pattern = options.pattern ?? DENSE, origin = options.origin ?? from;
    for (let step = Math.ceil((from - origin) / SIXTEENTH - 1e-9); origin + step * SIXTEENTH < to - .02; step++) {
      if (!pattern[step % 16]) continue;
      const chord = chords[Math.floor(step / 16) % chords.length], midi = chord.tones[WALK[walk++ % WALK.length]] + (options.octave ?? 0);
      const accent = step % 4 === 0 ? 1 : .72, drift = (mix.random() - .5) * .006;
      key(mix, origin + step * SIXTEENTH + drift, midi, velocity * accent * (.92 + mix.random() * .16), {...KEYS, pan: (step % 2 ? .42 : -.42)}, {decay: options.decay});
    }
  };
  /** A run of glints `every` seconds apart, panned across. */
  const glints = (time: number, notes: readonly number[], velocity: number, every = .12, decay = .32, pan = 0) =>
    notes.forEach((midi, i) => glint(mix, time + i * every, midi, velocity * (1 - i * .04), {...GLASS_ROUTE, pan: pan - .55 + 1.1 * i / Math.max(1, notes.length - 1)}, {decay}));
  /** Sparse glass on off-beat 8ths, in the scale, `chance` of each sounding. */
  const sparkle = (from: number, to: number, velocity: number, chance = .35) => {
    for (let at = from + .25; at < to - .05; at += .5) if (mix.random() < chance)
      glint(mix, at, GLASS[Math.floor(mix.random() * GLASS.length)], velocity * (.7 + .3 * mix.random()), {...GLASS_ROUTE, pan: (mix.random() - .5) * 1.4}, {decay: .4});
  };
  const crisp = (time: number, velocity: number, pan = 0, tone = 2600) => tick(mix, time, velocity, {...TICKS, pan}, {tone});
  /** Even ticks every `step`, alternating sides. */
  const ticks = (from: number, to: number, step: number, velocity: number) => {
    for (let at = from, k = 0; at < to - 1e-6; at += step, k++) crisp(at, velocity * (k % 2 ? .75 : 1), k % 2 ? .25 : -.25);
  };
  /** Ticks that speed up from `slow` to `fast` seconds apart, and get a little louder. */
  const ratchet = (from: number, to: number, slow: number, fast: number, velocity: [number, number], tone: [number, number] = [2400, 3000]) => {
    for (let at = from, k = 0; at < to - 1e-6; k++) {
      const progress = (at - from) / (to - from);
      crisp(at, velocity[0] + (velocity[1] - velocity[0]) * progress, k % 2 ? .3 : -.3, tone[0] + (tone[1] - tone[0]) * progress);
      at += slow * (fast / slow) ** progress;
    }
  };
  /** A cheap pass: six ticks sweeping across the screen. */
  const flick = (at: number, duration: number, rightward: boolean) => {
    for (let k = 0; k < 6; k++) crisp(at + k * duration / 6, .5 - k * .04, (rightward ? -1 : 1) * (.6 - k * .24), 2900 + (rightward ? k : -k) * 120);
  };

  // ── Air: a near-silent floor for the whole film, opened up in the breakdowns.
  const open = [[u2.upwardTurn.at, u2.warning], [u2.zoom.at + u2.zoom.duration, cues.chapter.cost.start], [cost.depletion.at, flow.reveal], [flow.cameraToAnalysis.at, flow.cameraToEngine.at], [end.logo, end.end]];
  air(mix, 0, cues.duration, time => db(open.some(([a, b]) => time >= a && time < b) ? -22 : -30), AIR);

  // ── This is the agent you've built: a crisp click, then the reference's quiet opening cell — no sub yet.
  crisp(u2.agentEnter, 1.2, 0, 3700);
  glint(mix, u2.agentEnter + .02, 94, .55, GLASS_ROUTE, {decay: .6});
  keys(u2.agentEnter + .12, u2.stream.at, [OPEN], .42, {pattern: SPARSE});
  glints(u2.firstThinking.at, [87, 92], .3, .14);

  // ── Every time it runs, it leaves a trace: the sub enters with the stream and pulses in bars; ticks count the beats.
  const failSilence = before(u2.stream.at, u2.failure);
  pulse(u2.stream.at, failSilence, [32, 32, 34], .9);
  keys(u2.stream.at, failSilence, [OPEN, V], .55, {origin: u2.stream.at});
  ticks(u2.stream.at, failSilence, .5, .3);

  // ── When your agent fails: total silence, then a sagging A♯ and a falling pair.
  hit(u2.failure, 34, .5, .95, {drift: -3, release: .35});
  crisp(u2.failure, .9, 0, 2200);
  glints(u2.failure + .04, [92, 87], .45, .16, .5);

  // ── The trace can tell you why: a breakdown with no sub; the camera's turns are glints and ticks.
  keys(u2.upwardTurn.at, u2.warning, [vi, IV], .42, {pattern: EIGHTHS});
  glints(u2.upwardTurn.at, [85, 89, 94], .3, u2.upwardTurn.duration / 4);
  ratchet(u2.backtrack.at, u2.backtrack.at + .5, .1, .06, [.35, .2], [3200, 2200]);
  u2.drawers.forEach((time, i) => { glint(mix, time, [87, 92, 97][i], .42 + i * .05, {...GLASS_ROUTE, pan: -.3 + i * .3}); crisp(time, .45); });
  glint(mix, u2.highlight.at, 99, .3, GLASS_ROUTE, {decay: .5});

  // ── The insights are hidden across thousands of traces: the sub returns on the warning, its blue E rings once;
  // the zoom thickens the ticks into a ratchet, a faint whistle rising under it.
  const collapse = u2.collapse.at + u2.collapse.duration, collapseSilence = before(u2.warning, collapse);
  hit(u2.warning, 32, Math.min(1.45, u2.warning + BAR - GAP - u2.warning - ATTACK - RELEASE), 1);
  crisp(u2.warning, .8);
  glint(mix, u2.warning + .03, BLUE, .4, GLASS_ROUTE, {decay: .7});
  pulse(u2.warning + BAR, collapseSilence, [34, 30, 32], .72);
  keys(u2.warning, collapseSilence, [V, vi, IV, V], .4, {pattern: SPARSE, origin: u2.warning});
  ratchet(u2.zoom.at, collapseSilence, .25, .045, [.12, .32]);
  whistle(mix, u2.zoom.at + .4, collapseSilence, LIFT, {fromMidi: 100, toMidi: 110, level: .035});
  // The stream collapses into a point: a deep D♯ falls away, the cloud drifts in on glass.
  hit(collapse, 27, 1.3, 1, {drift: -2, release: .4});
  crisp(collapse, .7, 0, 2000);
  glints(collapse + .05, [97, 92, 87, 85], .3, .2, .6);
  sparkle(collapse + 1.5, u2.ifOnly, .32, .3);
  keys(collapse + 2, u2.ifOnly, [IV], .3, {pattern: SPARSE});
  // If only someone could read them all: a rising phrase left hanging, then silence.
  glints(u2.ifOnly, [85, 87, 92, 94], .4, .25, .9);

  // ── Cheap LLMs: A♯ minor colour, thin keys up an octave; each pass is a tick flick across the screen.
  const costStart = cues.chapter.cost.start, bashSilence = before(costStart, cost.bashStop);
  hit(costStart, 34, 1.5, .95);
  crisp(costStart, .8);
  keys(costStart, cost.missIssues, [vi, IV], .38, {octave: 12, decay: .09, origin: costStart});
  cost.cheapLegs.forEach(leg => flick(leg.at, leg.duration, leg.direction === 'leftToRight'));
  // …fail to find crucial issues: three short blips that stop, and the glass droops.
  [0, .12, .24].forEach((offset, i) => hit(cost.missIssues + offset, 34, .05, .7 - i * .12, {release: .05}));
  glints(cost.missIssues + .05, [87, 85, 80], .38, .18, .45);
  keys(cost.missIssues + .5, bashSilence, [ii], .3, {pattern: SPARSE});
  // Powerful LLMs: the heaviest sub before Flow-1, a low F♯ after a breath of silence.
  hit(cost.bashStop, 30, 1.2, .95, {drive: 2.2});
  crisp(cost.bashStop, 1, 0, 2000);
  glint(mix, cost.bashStop + .02, 73, .5, GLASS_ROUTE, {decay: 1});
  keys(cost.bashDescent.at, cost.bashWarning, [IV, ii], .45, {pattern: EIGHTHS, origin: cost.bashDescent.at});
  ratchet(cost.bashDescent.at, cost.bashDescent.at + cost.bashDescent.duration, .2, .12, [.18, .1], [3000, 2200]);
  hit(cost.bashWarning, 32, 1.1, .85);
  glint(mix, cost.bashWarning + .02, BLUE, .38, GLASS_ROUTE, {decay: .6});
  // …but the costs are unsustainable: the counter runs, then the sub sinks a fifth and the keys slow to a stop.
  glint(mix, cost.budgetAppear, 92, .35, GLASS_ROUTE);
  ratchet(cost.budgetRun.at, cost.budgetRun.at + cost.budgetRun.duration, .12, .04, [.25, .4]);
  hit(cost.depletion.at, 32, cost.depletion.duration - ATTACK, .85, {drift: -7, release: .35});
  [75, 70, 68, 63, 58, 56].reduce((at, midi, i) => { key(mix, at, midi, .5 - i * .05, KEYS, {decay: .35}); return at + .125 * 1.45 ** i; }, cost.depletion.at);

  // ── Until now: almost nothing — air, one high C♯ — then a thin whistle into silence.
  glint(mix, cost.depletion.at + cost.depletion.duration, 85, .28, GLASS_ROUTE, {decay: 1.2});
  const revealSilence = before(cost.depletion.at, flow.reveal);
  whistle(mix, revealSilence - .9, revealSilence, LIFT, {fromMidi: 98, toMidi: 111, level: .06});

  // ── Introducing Flow-1: the sub finds the tonic C♯; the groove is the reference's core — gated bars, 16th keys,
  // glass on the off-beats — on I – vi – IV – V.
  hit(flow.reveal, 25, 1.5, 1.15, {drive: 2.2});
  crisp(flow.reveal, 1.1, 0, 3400);
  glints(flow.reveal + .01, [85, 89, 92, 97], .45, .03, 1.4);
  const pricing = flow.cameraToAnalysis.at;
  pulse(flow.reveal + BAR, pricing - .05, [34, 30, 32, 25], .85);
  keys(flow.reveal, pricing, [I, vi, IV, V], .5, {origin: flow.reveal});
  sparkle(flow.reveal + BAR, pricing, .3);
  ticks(flow.reveal + BAR, pricing, .5, .2);
  // The benchmark beads climb the scale; Flow-1's own bead (index 2) lands highest, with a tick.
  flow.numberDrops.forEach((time, i) => glint(mix, time, i === 2 ? 99 : GLASS[Math.min(i, 5)], i === 2 ? .55 : .32, {...GLASS_ROUTE, pan: -.4 + i * .16}, {decay: i === 2 ? .8 : .3}));
  crisp(flow.numberDrops[2], .7, .1, 3200);

  // ── 20× more traces per dollar: the reference's breakdown — the sub drops out, a fine tick grid draws with the
  // comparison and the counts ratchet; then the build: pulses halve toward the engine and the whistle rises.
  keys(pricing, flow.cameraToEngine.at - .2, [vi, IV], .4, {pattern: EIGHTHS, origin: pricing});
  ticks(pricing + .06, pricing + 1.5, SIXTEENTH, .12);
  ratchet(flow.analysisCountUp.at, flow.analysisCountUp.at + flow.analysisCountUp.duration, .08, .035, [.18, .3]);
  glints(flow.analysisCountUp.at + flow.analysisCountUp.duration, [92, 97], .4, .1, .5);
  const engineSilence = before(pricing, flow.cameraToEngine.at);
  accelerate(engineSilence - 1.75, engineSilence, 32, .6, 1);
  whistle(mix, engineSilence - 1.3, engineSilence, LIFT, {fromMidi: 100, toMidi: 110, level: .04});
  // Flow-1 powers Signals: the camera lands on V, the module lights, the spinner ticks, the cover shuts on C♯.
  hit(flow.cameraToEngine.at, 32, .4, .9);
  crisp(flow.cameraToEngine.at, .7);
  glint(mix, flow.moduleActivation, 94, .45, GLASS_ROUTE, {decay: .5});
  crisp(flow.moduleActivation, .6, .2, 3200);
  ticks(flow.engineSpinner.at, before(flow.engineSpinner.at, flow.coverShut), SIXTEENTH / 2, .16);
  hit(flow.coverShut, 25, 1.3, 1.1, {drive: 2});
  crisp(flow.coverShut, 1, 0, 2200);
  glints(flow.coverShut + .02, [85, 92], .35, .05, 1);

  // ── Our agent, built to analyze traces at scale: darker and sparser — ii and vi, pulses at the old pace.
  const zoom = p.zoomOut;
  pulse(p.bashStop, zoom.at, [34, 30, 32, 30], .62);
  keys(flow.coverShut + 1.5, zoom.at, [ii, vi], .34, {pattern: SPARSE});
  flick(p.bashEntry.at, p.bashEntry.duration, true);
  crisp(p.bashStop, .7, 0, 2200);
  ratchet(p.descent.at, p.descent.at + p.descent.duration, .16, .1, [.2, .12], [3100, 2200]);
  glint(mix, p.highlight, 92, .35, GLASS_ROUTE);
  if (p.bubble !== undefined) { crisp(p.bubble, .6, .2, 3300); glints(p.bubble + .02, [94, 99], .35, .08); }
  if (p.labels) for (let k = 0; k < 4; k++) { const at = p.labels.at + k * p.labels.duration / 4; crisp(at, .4, -.2 + k * .14); glint(mix, at, GLASS[k + 1], .26, GLASS_ROUTE, {decay: .25}); }
  if (p.explanation) for (let at = p.explanation.at; at < p.explanation.at + p.explanation.duration; at += .05 + mix.random() * .05) crisp(at, .12 + mix.random() * .06, .15, 3000);
  if (p.bubbleExit !== undefined) crisp(p.bubbleExit, .5, .2);
  // Across every trace: the zoom out is the build — ticks race, the pulses halve, the circle grows on rising keys.
  const gridSilence = before(zoom.at, issues.native);
  ratchet(zoom.at, gridSilence, .25, .045, [.12, .34]);
  accelerate(zoom.at + .2, gridSilence, 32, .7);
  keys(p.circleGrow.at, gridSilence, [V], .45, {origin: p.circleGrow.at});
  whistle(mix, gridSilence - 1.4, gridSilence, LIFT, {fromMidi: 99, toMidi: 110, level: .05});

  // ── The issue grid lands on the tonic: all 47 triangles pop as one glass cascade.
  hit(issues.native, 25, 1.4, 1.1, {drive: 2.1});
  crisp(issues.native, 1, 0, 3400);
  for (const note of cascade(issues.pops, GLASS, .035)) glint(mix, note.time, note.midi, .22, {...GLASS_ROUTE, pan: note.pan * .7}, {decay: .4});
  // It clusters issues into high-level patterns: the groove returns; each cluster lock is one glass note.
  const windowSilence = issues.windowDown.at;
  pulse(issues.native + BAR, windowSilence, [34, 30], .8);
  keys(issues.native, issues.windowUp.at, [I, vi, IV, V], .45, {origin: issues.native});
  sparkle(issues.native + BAR, issues.windowDown.at, .26);
  cascade(issues.clusters.map((at, i) => ({at, pan: -.5 + i * .2, height: i / Math.max(1, issues.clusters.length - 1)})), GLASS.slice(1), .06)
    .forEach(note => glint(mix, note.time, note.midi, .38, {...GLASS_ROUTE, pan: note.pan}, {decay: .45}));
  if (issues.clusters.length) crisp(issues.clusters[0], .6);
  // Ready for you or your coding agent: the window drops and shuts with ticks, the badges ring, the message sends.
  hit(issues.windowDown.at, 32, .3, .55, {release: .15});
  crisp(issues.windowShut, .7, -.1, 2200);
  hit(issues.windowShut, 32, Math.max(.3, cues.chapter.conclusion.start - issues.windowShut - ATTACK - RELEASE - GAP), .62);
  glint(mix, issues.issueBadge, 94, .38, GLASS_ROUTE);
  crisp(issues.messageSend, .55, .2, 3300); glint(mix, issues.messageSend + .02, 97, .3, GLASS_ROUTE);
  glint(mix, issues.queryBadge, 99, .36, GLASS_ROUTE);
  crisp(issues.windowUp.at, .45, .1);
  if (mix.typingEnabled) for (const event of issues.typingEvents) keyClick(mix, event.time, .3, TYPING, event.voice);

  // ── Unlock the insights hiding in millions of agent traces: the reference's last eight seconds — IV, then V pulses
  // halving into a 400 ms silence; then the lowest C♯ of the film holds under a soft C♯6 bloom for "with Laminar".
  const conclusion = cues.chapter.conclusion.start, logoSilence = before(conclusion, end.logo);
  hit(conclusion, 30, BAR - ATTACK - RELEASE - GAP, .85);
  keys(conclusion, logoSilence, [IV, V], .48, {origin: conclusion});
  accelerate(conclusion + BAR, logoSilence, 32, .82);
  ratchet(conclusion + BAR, logoSilence, .25, .04, [.12, .36]);
  sparkle(conclusion + .5, logoSilence - .5, .28, .4);
  whistle(mix, logoSilence - 1.5, logoSilence, LIFT, {fromMidi: 99, toMidi: 111, level: .07});
  const tail = end.end - end.logo - .1;
  hit(end.logo, 25, tail - ATTACK - .5, .8, {drive: 2.2, drift: -.15, release: .5});
  crisp(end.logo, .9, 0, 3400);
  [73, 77, 80, 82, 85].forEach((midi, i) => glint(mix, end.logo + .02 + i * .04, midi, .32 - i * .02, {...GLASS_ROUTE, pan: -.3 + i * .15}, {attack: .25, decay: 1.6}));
}
