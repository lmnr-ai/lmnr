import type {ScoreCues} from '../cues';
import {db} from '../dsp';
import {suckOuts} from '../openai/composition';
import {keyClick, type Mix, type Route} from '../voices';
import {cascade} from '../writing';
import {bloom, carve, crackle, drone, glass, grain, overtones, pluck, rise, strikes, sub, thump} from './instruments';

/*
 * "OpenAI tactile" (LAM-2320 v2) — v1's C♯ pentatonic form, rebuilt on what makes the reference touchable: grains
 * instead of tones, a small room behind every hit, a sub that is struck every eighth, and real contrast into the drops.
 *
 * Throughline: the major third (F) is held back from every chord until Flow-1. Act 1 sits on G♯ and A♯ sus colours,
 * wide and uneasy; Cost gets thin, then rough, then drains — the top closes to 2 kHz and the grains slow to one a
 * second. "Until now" reopens the top over overtones with no fundamental and a reverse swell cut dead 230 ms early;
 * Flow-1 lands the first C♯ with its third. After that the groove is confident and the issue grid is a second C♯.
 * "Unlock the insights" blooms on IV, builds with no sub at all, goes silent, and the logo is the film's deepest C♯;
 * its chord only enters once "with Laminar" has been said.
 */

export const TACTILE_LAYERS = ['sub', 'body', 'keys', 'glass', 'grain', 'bloom', 'lift', 'typing'] as const;
export type TactileLayer = typeof TACTILE_LAYERS[number];

type Chord = {root: number; tones: readonly number[]};
// Before Flow-1: no F (the third). Sub roots: C♯1 25, D♯1 27, F♯1 30, G♯1 32, A♯1 34.
const SUS: Chord = {root: 32, tones: [56, 58, 63, 68, 70]};
const V: Chord = {root: 32, tones: [56, 63, 68, 70, 75]};
const vi7: Chord = {root: 34, tones: [58, 61, 63, 68, 70]};
const IV: Chord = {root: 30, tones: [58, 61, 63, 68, 70]};
const ii7: Chord = {root: 27, tones: [58, 63, 68, 70, 75]};
// From Flow-1 on: the third is in.
const I: Chord = {root: 25, tones: [61, 63, 65, 68, 73]};
const vi: Chord = {root: 34, tones: [58, 61, 65, 70, 73]};
const ii: Chord = {root: 27, tones: [58, 63, 65, 70, 75]};
/** Short glass, G♯6 up; long glass only from C♯7. */
const GLASS = [92, 94, 97, 99, 101, 104, 106];
const BLUE = 88;

const DENSE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const SPARSE = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const EIGHTHS = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
const WALK = [0, 2, 4, 1, 3, 2, 4, 1];
const SIXTEENTH = .125, BAR = 2;
const ATTACK = .012, RELEASE = .15, GAP = .25, OCTAVE = .5;
/** The two payoffs keep true silence before them; every other suck-out only dips the music 10 dB, so the room tails carry. */
const payoffs = (cues: ScoreCues) => [cues.flow.reveal, cues.conclusion.logo];

export function duckTactile(mix: Mix, cues: ScoreCues) {
  // Broadband only -2.5 dB under speech: `carve` takes the voice band down further, so the rest of the bed stays big.
  for (const phrase of cues.voice) mix.duck(phrase.at, db(-2.5), .08, phrase.duration, .3);
  const full = payoffs(cues);
  for (const [drop, length] of suckOuts(cues)) mix.duck(drop - length + .03, full.includes(drop) ? .003 : .3, .03, length - .045, .015);
}

export function composeTactile(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion, p = issues.prelude;
  const layer = (name: TactileLayer, route: Route): Route => ({...route, gain: (route.gain ?? 1) * mix.layer(name)});
  // The sub stays dry and mono on the sfx bus, but its harmonics (above the room's 120 Hz cut) leave a tail in the gaps.
  const SUB = layer('sub', {bus: 'sfx', gain: 1, room: .25});
  const BODY = layer('body', {bus: 'music', gain: 1, room: .25});
  const KEYS = layer('keys', {bus: 'music', gain: 1, room: .35, hall: .1});
  const GLASS_ROUTE = layer('glass', {bus: 'music', gain: 1, room: .2, hall: .25, delay: .06});
  const GRAIN = layer('grain', {bus: 'music', gain: 1, room: .3});
  const BLOOM = layer('bloom', {bus: 'music', gain: 1, hall: .5});
  const LIFT = layer('lift', {bus: 'music', gain: 1, room: .2, hall: .15});
  const TYPING = layer('typing', {bus: 'sfx', gain: 1, room: .04});
  const sucks = suckOuts(cues);
  const before = (time: number, limit: number) => Math.min(limit, ...sucks.map(([drop, length]) => drop - length).filter(at => at > time + .05));
  const spoken = (from: number, to: number) => cues.voice.some(phrase => phrase.at < to && phrase.at + phrase.duration > from);
  const r = () => mix.random();

  /** A sub note, its octave and onset thump; 3 dB softer under a line it overlaps (unless `loud`). */
  const hit = (time: number, root: number, hold: number, velocity: number, options: Parameters<typeof sub>[6] & {thump?: number; loud?: boolean} = {}) => {
    const v = velocity * (!options.loud && spoken(time, time + hold) ? db(-3) : 1);
    sub(mix, time, root, hold, v, SUB, options);
    // The octave above on the music bus is the sub's body on small speakers; it ducks and carves with the voice.
    sub(mix, time, root + 12, hold, v * OCTAVE, BODY, {...options, drive: [2.4, 1.8]});
    thump(mix, time, v * (options.thump ?? .5), BODY);
  };
  /** Struck sub bars from `from` to `to`; the eighth strikes each carry a faint thump. */
  const pulse = (from: number, to: number, roots: readonly number[], velocity: number) => {
    for (let k = 0, at = from; at < to - .1; k++, at += BAR) {
      const hold = Math.min(at + BAR, to) - at - ATTACK - RELEASE - GAP;
      if (hold <= .06) continue;
      const v = velocity * (k % 2 ? .92 : 1);
      hit(at, roots[k % roots.length], hold, v);
      for (const offset of strikes(hold).slice(1)) thump(mix, at + offset, v * (spoken(at, at + hold) ? .16 : .26), BODY, (r() - .5) * .4);
    }
  };
  const accelerate = (from: number, to: number, root: number, velocity: number, period = BAR) => {
    for (let at = from, k = 0; at < to - .1 && period > .1; at += period, period /= 2, k++) {
      const hold = Math.max(.05, Math.min(at + period, to) - at - ATTACK - Math.min(RELEASE, period * .3) - Math.min(GAP, period * .3));
      hit(at, root, hold, velocity * (1 + k * .06), {release: Math.min(RELEASE, period * .3), thump: .35});
    }
  };

  let walk = 0;
  /** Felt plucks walking a cell on 16ths, folded into `range` (G♯3–C♯5 by default) and scattered ±.6. */
  const keys = (from: number, to: number, chords: readonly Chord[], velocity: number, options: {pattern?: readonly number[]; range?: [number, number]; decay?: number; origin?: number} = {}) => {
    const pattern = options.pattern ?? DENSE, origin = options.origin ?? from, [low, high] = options.range ?? [56, 73];
    for (let step = Math.ceil((from - origin) / SIXTEENTH - 1e-9); origin + step * SIXTEENTH < to - .02; step++) {
      if (!pattern[step % 16]) continue;
      let midi = chords[Math.floor(step / 16) % chords.length].tones[WALK[walk++ % WALK.length]];
      while (midi < low) midi += 12; while (midi > high) midi -= 12;
      const accent = step % 4 === 0 ? 1 : .7;
      pluck(mix, origin + step * SIXTEENTH + (r() - .5) * .006, midi, velocity * accent * (.9 + r() * .2), KEYS, (r() - .5) * 1.2, {decay: options.decay});
    }
  };
  const ring = (time: number, midi: number, velocity: number, options: Parameters<typeof glass>[4] = {}) => glass(mix, time, midi, velocity, GLASS_ROUTE, options);
  const run = (time: number, notes: readonly number[], velocity: number, every = .12, options: Parameters<typeof glass>[4] = {}) =>
    notes.forEach((midi, i) => ring(time + i * every, midi, velocity * (1 - i * .04), {...options, pan: (options.pan ?? 0) - .6 + 1.2 * i / Math.max(1, notes.length - 1)}));
  const sparkle = (from: number, to: number, velocity: number, chance = .35, tone?: number) => {
    for (let at = from + .25; at < to - .05; at += .5) if (r() < chance) ring(at, GLASS[Math.floor(r() * GLASS.length)], velocity * (.7 + .3 * r()), {pan: (r() - .5) * 1.6, tone});
  };
  const click = (time: number, velocity: number, pan = 0) => { grain(mix, time, velocity, GRAIN, pan, {decay: .004}); grain(mix, time + .0015, velocity * .6, GRAIN, -pan, {tone: 2200, decay: .003}); };
  /**
   * Grains on the 16th grid from `origin` at `rate(time)` per second (16ths fill first, then 32nds), humanised ±6 ms,
   * levels ±4 dB, every third one a ghost at -10 dB.
   */
  const grains = (from: number, to: number, rate: (time: number) => number, velocity: number, origin = from) => {
    for (let k = Math.ceil((from - origin) / (SIXTEENTH / 2) - 1e-9); origin + k * SIXTEENTH / 2 < to - .01; k++) {
      const at = origin + k * SIXTEENTH / 2, sixteenth = k % 2 === 0, perSecond = rate(at);
      const chance = sixteenth ? Math.min(1, perSecond / 8) : Math.max(0, (perSecond - 8) / 8);
      if (r() >= chance) continue;
      const level = velocity * db((r() - .5) * 8) * (r() < .33 ? db(-10) : 1) * (k % 8 === 0 ? 1.25 : 1);
      grain(mix, at + (r() - .5) * .012, level, GRAIN, (r() - .5) * 1.1);
    }
  };
  const ramp = (from: number, to: number, a: number, b: number) => (t: number) => a + (b - a) * Math.max(0, Math.min(1, (t - from) / (to - from)));
  /** Into a drop: grains 4 → 24/s with crackle, and a noise band climbing above the voice. */
  const build = (from: number, to: number, velocity: number, band: [number, number] = [4000, 7000]) => {
    grains(from, to, ramp(from, to, 4, 24), velocity);
    crackle(mix, from + (to - from) * .4, to, ramp(from + (to - from) * .4, to, 80, 150), db(-30) * velocity * 4, GRAIN);
    rise(mix, from, to, LIFT, {fromHz: band[0], toHz: band[1], level: .06 * velocity * 4});
  };
  /** A flick across the screen: six grains panning one way. */
  const flick = (at: number, duration: number, rightward: boolean) => {
    for (let k = 0; k < 6; k++) grain(mix, at + k * duration / 6, .5 - k * .05, GRAIN, (rightward ? -1 : 1) * (.8 - k * .32), {tone: 3200 + (rightward ? k : -k) * 300, decay: .004});
  };
  /** Ticks that speed up from `slow` to `fast` seconds apart. */
  const ratchet = (from: number, to: number, slow: number, fast: number, velocity: [number, number]) => {
    for (let at = from, k = 0; at < to - 1e-6; k++) {
      const progress = (at - from) / (to - from);
      grain(mix, at, velocity[0] + (velocity[1] - velocity[0]) * progress, GRAIN, k % 2 ? .45 : -.45);
      at += slow * (fast / slow) ** progress;
    }
  };

  // ── This is the agent you've built: cold and curious — a click, sus plucks with no sub, two grains a second.
  click(u2.agentEnter, .9);
  ring(u2.agentEnter + .02, 97, .45, {decay: .5});
  keys(u2.agentEnter + .12, u2.stream.at, [SUS], .4, {pattern: SPARSE});
  grains(.3, u2.stream.at, () => 2, .35);
  run(u2.firstThinking.at, [92, 99], .3, .14);

  // ── Every time it runs, it leaves a trace: the struck sub enters on G♯; plucks and grains on 16ths.
  const failSilence = before(u2.stream.at, u2.failure);
  pulse(u2.stream.at, failSilence, [32, 32, 34], .9);
  keys(u2.stream.at, failSilence, [SUS, V], .5, {origin: u2.stream.at});
  grains(u2.stream.at, failSilence, () => 8, .4, u2.stream.at);

  // ── When your agent fails: an A♯ that sags three semitones, a falling pair onto the blue E.
  hit(u2.failure, 34, .5, .95, {drift: -3, release: .3, thump: .8});
  click(u2.failure, .9);
  run(u2.failure + .04, [94, BLUE + 12], .4, .16, {decay: .45});

  // ── The trace can tell you why / the insights are hidden: no groove, a low room-tone drone, wide sus plucks with
  // long room tails, dull glass (under 6 kHz). The sub only marks the warning and the collapse.
  const collapse = u2.collapse.at + u2.collapse.duration, collapseSilence = before(u2.warning, collapse);
  // Room tone under the whole film: -26 dB in the hidden-insights breakdown, -30 elsewhere, gone only before the payoffs.
  const silent = (t: number) => sucks.some(([drop, length]) => payoffs(cues).includes(drop) && t > drop - length - .15 && t < drop + .05);
  // On the sfx bus, so the suck-outs and voice ducks leave it alone: it is the air the gaps sit in.
  drone(mix, .2, end.end, t => silent(t) ? 0 : db(t > u2.failure + .3 && t < u2.ifOnly + 1.4 ? -26 : -30), {...BODY, bus: 'sfx'});
  keys(u2.upwardTurn.at, u2.warning, [vi7, IV], .38, {pattern: EIGHTHS});
  run(u2.upwardTurn.at, [92, 97, 101], .28, u2.upwardTurn.duration / 4, {tone: 6000});
  ratchet(u2.backtrack.at, u2.backtrack.at + .5, .1, .06, [.3, .18]);
  u2.drawers.forEach((time, i) => { ring(time, [94, 99, 104][i], .4 + i * .05, {pan: -.4 + i * .4, tone: 6000}); click(time, .4, -.3 + i * .3); });
  ring(u2.highlight.at, 104, .3, {decay: .4, tone: 6000});
  hit(u2.warning, 32, 1.4, 1, {thump: .7});
  click(u2.warning, .7);
  ring(u2.warning + .03, BLUE + 12, .38, {decay: .7, tone: 6000});
  keys(u2.warning, collapseSilence, [V, vi7, IV, V], .36, {pattern: SPARSE, origin: u2.warning});
  grains(u2.warning + 1, u2.zoom.at, () => 3, .3);
  // The zoom out across thousands of traces is the act's build.
  build(u2.zoom.at + .3, collapseSilence, .55);
  hit(collapse, 27, 1.3, 1, {drift: -2, release: .4, thump: .8});
  click(collapse, .7);
  run(collapse + .05, [104, 99, 94, 92], .3, .2, {decay: .5, tone: 6000});
  sparkle(collapse + 1.5, u2.ifOnly, .3, .3, 6000);
  keys(collapse + 2, u2.ifOnly, [IV], .28, {pattern: SPARSE});
  // If only someone could read them all: a rising phrase left hanging.
  run(u2.ifOnly, [92, 94, 99, 104], .38, .25, {decay: .8});

  // ── Cheap LLMs: high, thin and small — a light A♯, plucks an octave up and dry, flicks across the screen.
  const costStart = cues.chapter.cost.start, bashSilence = before(costStart, cost.bashStop);
  hit(costStart, 34, 1.3, .7, {thump: .3, drive: [2, 1.5]});
  click(costStart, .7);
  keys(costStart, cost.missIssues, [vi7, IV], .34, {range: [68, 85], decay: .07, origin: costStart});
  grains(costStart, cost.missIssues, () => 6, .3, costStart);
  cost.cheapLegs.forEach(leg => flick(leg.at, leg.duration, leg.direction === 'leftToRight'));
  // …fail to find crucial issues: three blips that stop short, and the glass droops.
  [0, .12, .24].forEach((offset, i) => hit(cost.missIssues + offset, 34, .05, .65 - i * .12, {release: .05, hits: [0], thump: .4}));
  run(cost.missIssues + .05, [99, 97, 92], .36, .18, {decay: .3});
  keys(cost.missIssues + .5, bashSilence, [ii7], .28, {pattern: SPARSE});
  // Powerful LLMs: rough and heavy — the low F♯ driven hard.
  hit(cost.bashStop, 30, 1.2, 1, {drive: [3.6, 2.8], thump: .9});
  click(cost.bashStop, .9);
  ring(cost.bashStop + .02, 97, .45, {decay: .9});
  keys(cost.bashDescent.at, cost.bashWarning, [IV, ii7], .42, {pattern: EIGHTHS, origin: cost.bashDescent.at});
  ratchet(cost.bashDescent.at, cost.bashDescent.at + cost.bashDescent.duration, .2, .12, [.18, .1]);
  hit(cost.bashWarning, 32, 1.1, .85, {thump: .6});
  ring(cost.bashWarning + .02, BLUE + 12, .36, {decay: .6});
  // …but the costs are unsustainable: the counter runs, then everything drains — the sub sinks a fifth, the grains
  // slow from eight a second to one and lose their room, and the whole top closes to 2 kHz.
  ring(cost.budgetAppear, 99, .34);
  ratchet(cost.budgetRun.at, cost.budgetRun.at + cost.budgetRun.duration, .12, .04, [.25, .4]);
  const drainFrom = cost.bashWarning + .2, drainTo = cost.depletion.at + cost.depletion.duration;
  for (let at = drainFrom; at < drainTo;) {
    const progress = (at - drainFrom) / (drainTo - drainFrom);
    grain(mix, at, .35 * (1 - .5 * progress), {...GRAIN, room: .3 - .2 * progress}, (r() - .5) * 1.6 * (1 - .6 * progress));
    at += 1 / (8 * (1 / 8) ** progress);
  }
  hit(cost.depletion.at, 32, cost.depletion.duration - ATTACK, .85, {drift: -7, release: .35, hits: [0, .5], decay: .9});
  [75, 70, 68, 63, 58, 56].reduce((at, midi, i) => { pluck(mix, at, midi, .48 - i * .05, KEYS, .3 - i * .12, {decay: .3}); return at + .125 * 1.45 ** i; }, cost.depletion.at);

  // ── Until now (hope): one G♯ rings in a long hall; then overtones of the coming C♯ rise with no fundamental, the
  // grains and crackle race, a noise band climbs, and a reverse swell of the C♯ fifth is cut dead 230 ms before the drop.
  const revealSilence = before(cost.depletion.at, flow.reveal);
  glass(mix, drainTo - .05, 92, .34, {...GLASS_ROUTE, hall: .7}, {decay: 1.4, attack: .02});
  overtones(mix, revealSilence - 1.2, revealSilence, 25, LIFT, {fromHz: 120, toHz: 600, level: .1});
  build(revealSilence - 1.1, revealSilence, .7);
  bloom(mix, revealSilence - .6, [49, 56, 61, 68], {...BLOOM, hall: 0}, {level: .16, attack: .6, reverse: true, cutoff: 3000});

  // ── Introducing Flow-1 (release): the first C♯, bent down from a fourth above; a thump, a bright click, and the
  // first chord with its third — C♯ G♯ C♯ F — blooming wide into the hall. Grains sparkle and thin out over 1.5 s.
  hit(flow.reveal, 25, BAR - ATTACK - RELEASE - GAP, 1.25, {drive: [3.2, 2.4], bend: 5, bendTime: .06, attack: .008, hits: [0], decay: .7, thump: 1, loud: true});
  click(flow.reveal, 1.2);
  grain(mix, flow.reveal, 1, GRAIN, 0, {tone: 2000, decay: .003});
  bloom(mix, flow.reveal, [49, 56, 61, 65], BLOOM, {level: .22, attack: .15, tail: 3.5, cutoff: 2500});
  run(flow.reveal + .01, [97, 101, 104, 109], .4, .03, {decay: 1.2});
  grains(flow.reveal + .02, flow.reveal + 1.5, t => 30 * (1 - (t - flow.reveal) / 1.5), .5);
  // Confident momentum: struck bars on I – vi – IV – V, plucks with the third, grains at ten a second.
  const pricing = flow.cameraToAnalysis.at;
  pulse(flow.reveal + BAR, pricing - .05, [34, 30, 32, 25], .85);
  keys(flow.reveal + .5, pricing, [I, vi, IV, V], .46, {origin: flow.reveal});
  grains(flow.reveal + 1.5, pricing, () => 10, .4, flow.reveal);
  sparkle(flow.reveal + BAR, pricing, .28);
  flow.numberDrops.forEach((time, i) => ring(time, i === 2 ? 104 : GLASS[Math.min(i, 5)], i === 2 ? .52 : .3, {pan: -.5 + i * .2, decay: i === 2 ? .8 : .12}));
  click(flow.numberDrops[2], .6, .1);

  // ── 20× more traces per dollar: the sub drops out, a fine grain grid draws the comparison, the counts ratchet,
  // then the pulses halve into the engine.
  keys(pricing, flow.cameraToEngine.at - .2, [vi, IV], .38, {pattern: EIGHTHS, origin: pricing});
  grains(pricing + .06, pricing + 1.5, () => 16, .22, pricing);
  ratchet(flow.analysisCountUp.at, flow.analysisCountUp.at + flow.analysisCountUp.duration, .08, .035, [.18, .3]);
  run(flow.analysisCountUp.at + flow.analysisCountUp.duration, [99, 104], .38, .1, {decay: .4});
  const engineSilence = before(pricing, flow.cameraToEngine.at);
  grains(pricing + 1.5, engineSilence - 1.75, () => 6, .3);
  accelerate(engineSilence - 1.75, engineSilence, 32, .6, 1);
  build(engineSilence - 1.4, engineSilence, .45);
  // Flow-1 powers Signals: the camera lands on V, the module lights, the spinner ticks, the cover shuts on C♯.
  hit(flow.cameraToEngine.at, 32, .4, .9, {thump: .6});
  click(flow.cameraToEngine.at, .7);
  ring(flow.moduleActivation, 101, .42, {decay: .5});
  click(flow.moduleActivation, .5, .2);
  grains(flow.engineSpinner.at, before(flow.engineSpinner.at, flow.coverShut), () => 20, .22);
  hit(flow.coverShut, 25, 1.3, 1.1, {thump: .9});
  click(flow.coverShut, 1);
  run(flow.coverShut + .02, [97, 104], .34, .05, {decay: 1});

  // ── Our agent, built to analyze traces at scale: darker, sparser — ii and vi, struck bars at the old pace.
  const zoom = p.zoomOut;
  pulse(p.bashStop, zoom.at, [34, 30, 32, 30], .62);
  keys(flow.coverShut + 1.5, zoom.at, [ii, vi], .32, {pattern: SPARSE});
  grains(flow.coverShut + 1, zoom.at, () => 4, .3);
  flick(p.bashEntry.at, p.bashEntry.duration, true);
  click(p.bashStop, .7);
  ratchet(p.descent.at, p.descent.at + p.descent.duration, .16, .1, [.2, .12]);
  ring(p.highlight, 99, .34);
  if (p.bubble !== undefined) { click(p.bubble, .6, .2); run(p.bubble + .02, [101, 106], .34, .08); }
  if (p.labels) for (let k = 0; k < 4; k++) { const at = p.labels.at + k * p.labels.duration / 4; click(at, .4, -.3 + k * .2); ring(at, GLASS[k + 1], .26, {pan: -.3 + k * .2}); }
  if (p.explanation) for (let at = p.explanation.at; at < p.explanation.at + p.explanation.duration; at += .05 + r() * .05) grain(mix, at, .14 + r() * .08, GRAIN, .2 + (r() - .5) * .3);
  if (p.bubbleExit !== undefined) click(p.bubbleExit, .5, .2);
  // Across every trace: the zoom out builds — grains race, the pulses halve, the circle grows on rising plucks.
  const gridSilence = before(zoom.at, issues.native);
  accelerate(zoom.at + .2, gridSilence, 32, .7);
  keys(p.circleGrow.at, gridSilence, [V], .42, {origin: p.circleGrow.at});
  build(zoom.at + .2, gridSilence, .6);

  // ── The issue grid lands on the tonic: 47 triangles pop as grains and a glass cascade.
  hit(issues.native, 25, 1.4, 1.1, {hits: [0], decay: 1.4, thump: .9});
  click(issues.native, 1);
  for (const note of cascade(issues.pops, GLASS, .035)) {
    ring(note.time, note.midi, .2, {pan: note.pan * .9});
    grain(mix, note.time, .3, GRAIN, note.pan);
  }
  // It clusters issues into patterns: the groove returns with a slow C♯7 counter-line; each cluster lock rings.
  const windowSilence = issues.windowDown.at;
  pulse(issues.native + BAR, windowSilence, [34, 30], .8);
  keys(issues.native, issues.windowUp.at, [I, vi, IV, V], .42, {origin: issues.native});
  grains(issues.native + 1, issues.windowUp.at, () => 10, .4, issues.native);
  [97, 99, 101, 97].forEach((midi, i) => ring(issues.native + BAR + i * .5, midi, .26, {decay: .6, pan: .3 - i * .2}));
  cascade(issues.clusters.map((at, i) => ({at, pan: -.6 + i * .24, height: i / Math.max(1, issues.clusters.length - 1)})), GLASS.slice(1), .06)
    .forEach(note => { ring(note.time, note.midi, .36, {pan: note.pan, decay: .4}); grain(mix, note.time, .3, GRAIN, note.pan); });
  // Ready for you or your coding agent: the window drops and shuts, the badges ring, the message sends.
  hit(issues.windowDown.at, 32, .3, .55, {release: .15, thump: .4});
  click(issues.windowShut, .7, -.1);
  hit(issues.windowShut, 32, Math.max(.3, cues.chapter.conclusion.start - issues.windowShut - ATTACK - RELEASE - GAP), .62);
  ring(issues.issueBadge, 101, .36);
  click(issues.messageSend, .55, .2); ring(issues.messageSend + .02, 104, .3);
  ring(issues.queryBadge, 106, .34);
  click(issues.windowUp.at, .45, .1);
  if (mix.typingEnabled) for (const event of issues.typingEvents) keyClick(mix, event.time, .3, TYPING, event.voice);

  // ── Unlock the insights hiding in millions of agent traces (final uplift): one bar of F♯ under a wide IV add9 bloom;
  // then IV → V plucks with no sub at all, grains 10 → 24/s and a climbing band, into 400 ms of silence.
  const conclusion = cues.chapter.conclusion.start, logoSilence = before(conclusion, end.logo);
  hit(conclusion, 30, BAR - ATTACK - RELEASE - GAP, .85, {thump: .8});
  bloom(mix, conclusion + .02, [54, 58, 61, 68], {...BLOOM, hall: .4}, {level: .16, attack: .6, hold: .6, tail: 2.4, cutoff: 2200});
  ring(conclusion + .04, 97, .32, {decay: 1.2, attack: .03});
  keys(conclusion, logoSilence, [IV, V], .44, {origin: conclusion});
  grains(conclusion + .5, conclusion + BAR, () => 10, .4, conclusion);
  grains(conclusion + BAR, logoSilence, ramp(conclusion + BAR, logoSilence, 10, 24), .45, conclusion);
  crackle(mix, logoSilence - .9, logoSilence, ramp(logoSilence - .9, logoSilence, 80, 150), db(-30) * 2, GRAIN);
  rise(mix, conclusion + BAR, logoSilence, LIFT, {fromHz: 4500, toHz: 6000, level: .2});
  overtones(mix, logoSilence - 1.2, logoSilence, 25, LIFT, {fromHz: 120, toHz: 500, level: .08});
  // The logo: the deepest C♯ of the film, a click and a spray of grains — nothing in the voice band while "with
  // Laminar" is spoken. Its chord (C♯ F G♯ A♯ C♯, the reference's last) swells in only after the brand name.
  // The sub hushes in ~.3 s so the name is heard, then is struck again with the chord.
  const said = cues.voice.at(-1)!, after = said.at + said.duration;
  hit(end.logo, 25, after - end.logo - ATTACK, 1.25, {drive: [3, 2.2], drift: -.15, release: .12, bend: 4, bendTime: .05, hits: [0], decay: .3, floor: .12, thump: 1, loud: true});
  hit(after, 25, end.end - .1 - after - ATTACK - .5, 1.05, {drive: [2.6, 2], drift: -.15, release: .5, bend: 0, attack: .06, hits: [0], decay: 2.6, thump: 0, loud: true});
  click(end.logo, 1.1);
  grains(end.logo + .02, end.logo + 1.2, t => 26 * (1 - (t - end.logo) / 1.2), .3);
  bloom(mix, after, [61, 65, 68, 70, 73], {...BLOOM, hall: .6}, {level: .2, attack: .4, hold: end.end - after - .4, tail: 1.5, cutoff: 3000});
  ring(after + .02, 97, .3, {decay: 1.6, attack: .2});
  ring(after + .1, 104, .2, {decay: 1.6, attack: .2, pan: .3});

  // The voice keeps its band: 300 Hz–3 kHz of the music dips 6 dB under every line.
  carve(mix, cues.voice, db(-6));
  // The drain closes the top to 2 kHz; "Until now" opens it again into the drop.
  const closeFrom = cost.bashWarning, closed = cost.depletion.at + cost.depletion.duration - .3, open = revealSilence - .3;
  mix.sweep(t => t < closeFrom || t > open ? 20_000 : t < closed ? 8000 * (2000 / 8000) ** ((t - closeFrom) / (closed - closeFrom)) : 2000 * 10 ** ((t - closed) / (open - closed)));
}
