import type {ScoreCues} from '../cues';
import {OnePole, db} from '../dsp';
import {beatOf, gridOf} from '../style';
import type {Mix, Route} from '../voices';
import {CHORUS, bassLine, bed, type BedKey} from './bed';
import {HIGH, I, IV, V} from './composition';
import {tapePad} from './instruments';
import {breath, click, dots, droplet, pop, swellKey, thump, tick} from './tactile';

/*
 * LAM-2317 v3, from a sound designer's forensics on the Cursor reference.
 *
 * - The emotion is in re-articulation, not in chord changes: three soft swelled keys repeat every
 *   ~0.84 s, offset ~0.28 s (an E♭ → A♭ → G cell, ~71 BPM each), inside a near-static chord. The bed
 *   keeps v2's continuity but loses its lockstep ±5-cent throb and plays 3 dB under the keys.
 * - Tactile means tone: pops, thumps, droplets and ticks are pure sines on chord tones, flat in pitch,
 *   20–40 ms, dry and centred, with any click as a separate faint high layer.
 * - Camera moves ride the music. Only five soft, grain-free breaths remain of v2's 13 paper slides.
 */

export const PAD: Route = {bus: 'music', hall: .3, room: .05};
export const BASS: Route = {bus: 'music', room: .02};
export const KEYS: Route = {bus: 'music', hall: .25, room: .05};
/** Hits are dry: no echo, a whisper of room. */
export const HIT: Route = {bus: 'sfx', room: .06, hall: .03};
// Thumps from the bash on play 5 dB hotter: the bed is fuller there, and the reference's stay 28–50 dB proud.
export const LATE_THUMP: Route = {...HIT, pan: 0, gain: 1.78};
export const AIR: Route = {bus: 'sfx', room: .05, hall: .12};

const ivMinor = [56, 59, 61, 63];
const IV_HIGH = [61, 63, 65, 68, 72];
const BLOOM = [48, 55, 60, 63, 67, 70, 75, 79, 80];
const PENTA = [63, 65, 68, 70, 72, 75, 77, 80];
const [Ab2, Db2, Eb2] = [44, 37, 39];
// Thump pitches: A♭2, B♭2 and D♭3 (104, 117 and 139 Hz), the reference's thump register.
const [THUMP_AB, THUMP_BB, THUMP_DB] = [44, 46, 49];

/**
 * A 120 Hz low shelf on everything emitted so far (bed and bass): -4 dB, dipping to -8 dB for 150 ms
 * under each thump so the thumps own the low end, as the reference's do.
 */
export function shelveLows(mix: Mix, thumps: readonly number[]) {
  const shelf = new Float32Array(mix.length).fill(db(-4));
  for (const time of thumps) for (let n = Math.max(0, Math.round((time - .005) * 48_000)), end = Math.min(mix.length, Math.round((time + .25) * 48_000)); n < end; n++) {
    const t = n / 48_000 - time, depth = t < 0 ? 1 - (t + .005) / .005 : t < .15 ? 0 : (t - .15) / .1;
    shelf[n] = Math.min(shelf[n], db(-8 + 4 * Math.min(1, Math.max(0, depth))));
  }
  for (const bus of [mix.music, mix.hall, mix.room, mix.delay]) for (const channel of [bus.l, bus.r]) {
    const low = OnePole.lowpass(120);
    for (let n = 0; n < channel.length; n++) channel[n] -= low.process(channel[n]) * (1 - shelf[n]);
  }
}

/** A phrase of repeating keys: voice i plays `voices[i]` (a note, or a sequence it cycles) every `period` ±15 %, offset `stagger`. */
export type Repeats = {from: number; to: number; voices: readonly (number | readonly number[])[]; period?: number; stagger?: number; level?: number; swell?: number};

export function repeats(mix: Mix, phrases: readonly Repeats[]) {
  for (const phrase of phrases) {
    const period = phrase.period ?? .84, stagger = phrase.stagger ?? .28, pans = phrase.voices.length === 1 ? [0] : [-.3, .3, 0, -.15];
    phrase.voices.forEach((voice, v) => {
      const notes = typeof voice === 'number' ? [voice] : voice;
      for (let t = phrase.from + v * stagger, k = 0; t < phrase.to; k++) {
        const velocity = (phrase.level ?? 1) * 10 ** ((mix.random() - .5) * 4 / 20);
        swellKey(mix, t, notes[k % notes.length], velocity, {...KEYS, pan: pans[v % pans.length]}, (phrase.swell ?? .25) * (.6 + .8 * mix.random()));
        t += period * (.85 + .3 * mix.random());
      }
    });
  }
}

export function composeCursorV3(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, prelude = issues.prelude, end = cues.conclusion;
  const reveal = flow.reveal, toAnalysis = flow.cameraToAnalysis.at + flow.cameraToAnalysis.duration * .5;
  const engine = flow.cameraToEngine.at + flow.cameraToEngine.duration * .6;
  const native = issues.native, logo = end.logo, half = end.start + (logo - end.start) * .5;
  const silence = cost.depletion.at + cost.depletion.duration - .2, afterCollapse = u2.collapse.at + u2.collapse.duration;

  // ── The undercurrent: v2's continuous bed on fewer harmonies, de-throbbed, breathing a third as deep.
  const keys: BedKey[] = [
    {at: u2.agentEnter, notes: HIGH, fade: 2, cutoff: 750, level: .7, breath: .06},
    {at: u2.failure, glide: .6, cutoff: 450, bend: -.5, bendTime: .6},
    {at: u2.upwardTurn.at, notes: IV_HIGH, fade: 1.2, glide: 1, cutoff: 850, bend: 0, bendTime: 1},
    {at: u2.insights, notes: HIGH, fade: 2.2, cutoff: 1200, level: .8},
    {at: cost.cloudOut.at + .3, notes: ivMinor, fade: 1.6, cutoff: 650, level: .75},
    {at: cost.bashStop, notes: [44, ...ivMinor], fade: .1, glide: .3, cutoff: 950},
    {at: cost.depletion.at, glide: cost.depletion.duration, cutoff: 300, bend: -2, bendTime: cost.depletion.duration},
    {at: silence, notes: [], fade: .2},
    {at: silence + .25, notes: [75], fade: .5, glide: .01, cutoff: 1200, level: .2, bend: 0, bendTime: .01},
    {at: reveal, notes: [...I, 75], fade: .12, glide: .4, cutoff: 1600, level: .8},
    {at: toAnalysis - .4, notes: IV, fade: 1.6, glide: 1.6, cutoff: 1500, level: .75},
    {at: engine, notes: V, fade: .6, cutoff: 1400},
    {at: flow.coverShut + .1, notes: I, fade: 1.4, cutoff: 1200, level: .7},
    {at: prelude.zoomOut.at + .3, notes: V, fade: 1.4, cutoff: 1400, level: .75},
    {at: native, notes: I, fade: .1, glide: .3, cutoff: 1500, level: .8},
    {at: end.start, notes: IV, fade: 1, cutoff: 900, level: .75},
    {at: half, notes: V, fade: .8, glide: logo - half, cutoff: 1800, level: .8},
    {at: logo, notes: BLOOM, fade: .5, glide: .5, cutoff: 1400, level: .7},
    {at: logo + .8, glide: 1.6, cutoff: 700},
  ];
  bed(mix, keys, PAD, CHORUS);
  bassLine(mix, [
    {at: 0, midi: null, fade: .01, level: 0},
    {at: reveal, midi: Ab2, fade: .06, level: .9},
    {at: toAnalysis - .2, midi: Db2, fade: .8},
    {at: engine, midi: Eb2, fade: .3, level: .95},
    {at: flow.coverShut + .1, midi: Ab2, fade: 1, level: .75},
    {at: prelude.zoomOut.at + .3, midi: Eb2, fade: .9, level: .8},
    {at: native, midi: Ab2, fade: .05, level: .9},
    {at: end.start, midi: Db2, fade: .7, level: .8},
    {at: half, midi: Eb2, fade: .6, level: .85},
    {at: logo, midi: Ab2, fade: .3, level: .6},
  ], BASS);
  shelveLows(mix, [u2.failure, u2.collapse.at + u2.collapse.duration * .8, cost.bashStop, reveal, flow.coverShut, prelude.bashStop, native, logo]);

  // ── The melody: soft keys that swell in and repeat, the reference's E♭ → A♭ → G cell, following the story.
  const [Eb4, F4, G4, Ab4, Bb4, C5, Eb5] = [63, 65, 67, 68, 70, 72, 75], Ab3 = 56;
  repeats(mix, [
    {from: u2.firstThinking.at, to: u2.upwardTurn.at, voices: [Eb4, Ab4, G4]},
    {from: u2.upwardTurn.at, to: u2.insights, voices: [Eb4, Ab4, F4]},
    {from: u2.insights, to: u2.collapse.at, voices: [Eb4, Ab4, [G4, G4, C5]], level: .85},
    // The collapse thins the cell to two voices, and the top climbs to C5 for "If only".
    {from: afterCollapse, to: u2.ifOnly, voices: [Ab4, C5], level: .8},
    {from: u2.ifOnly, to: cost.cloudOut.at + .3, voices: [G4, C5], period: 1, level: .85},
    // Cost: two voices, the lower sinking through the borrowed minor, gone at the depletion.
    {from: cost.cloudOut.at + .6, to: cost.depletion.at, voices: [Ab4, [Eb4, Eb4, 61, 59]], level: .75},
    // "Until now": an A♭3 pulse, the reference's held breath, carrying into Flow-1.
    {from: silence + .3, to: reveal, voices: [Ab3], period: .5, level: .45, swell: .12},
    // Under the Flow-1 lines the keys sit 1.5 dB lower.
    {from: reveal, to: flow.cameraZoom.at + 1.2, voices: [Ab3], period: .5, level: .34, swell: .12},
    {from: reveal + .15, to: toAnalysis - .4, voices: [Eb4, Ab4, G4], level: .84},
    {from: toAnalysis - .4, to: engine, voices: [Eb4, Ab4, F4], level: .95},
    {from: engine, to: flow.coverShut, voices: [Eb4, Bb4, G4], level: .95},
    // The analysis under dense narration: two voices only.
    {from: cues.chapter.issues.start, to: prelude.zoomOut.at + .3, voices: [Eb4, Ab4], period: .95, level: .75},
    {from: prelude.zoomOut.at + .3, to: native, voices: [Eb4, Bb4, G4], level: .85},
    {from: native + .1, to: end.start, voices: [Eb4, Ab4, [G4, C5]], level: .9},
    {from: end.start, to: half, voices: [Eb4, Ab4, F4], level: .9},
    {from: half, to: logo - .2, voices: [Eb4, Bb4, G4], period: .7, level: 1},
  ]);
  // Accents: C5 and E♭5 on the number drops, an E♭5/B♭5 lift on the cover, and one A♭4 + E♭5 swell for the logo.
  const drops = [...flow.numberDrops].sort((a, b) => a - b);
  swellKey(mix, drops[0], C5, .92, {...KEYS, pan: .2}, .1);
  swellKey(mix, drops.at(-1)!, Eb5, .84, {...KEYS, pan: -.2}, .1);
  swellKey(mix, flow.coverShut + .05, Eb5, 1, {...KEYS, pan: .25}, .2, 2);
  swellKey(mix, flow.coverShut + .12, Bb4, .9, {...KEYS, pan: -.25}, .2, 2);
  swellKey(mix, logo, Ab4, 1, {...KEYS, pan: -.15}, .3, 2.4);
  swellKey(mix, logo + .04, Eb5, .92, {...KEYS, pan: .15}, .3, 2.4);

  // ── Act 1. Pops for the agent; its runs are a soft pop pulse on chord tones that stops dead at the failure.
  pop(mix, u2.agentEnter + .02, Ab4, .7, {...HIT, pan: -.1});
  pop(mix, u2.firstThinking.at, Eb4, .5, {...HIT, pan: .1});
  for (let beat = Math.ceil(beatOf(cues, u2.stream.at, 4)), k = 0, time = gridOf(cues, beat); time < u2.failure - .05; k++, time = gridOf(cues, beat + k))
    pop(mix, time, [Eb4, Ab4, G4, Ab4][k % 4], k % 2 ? .6 : .9, {...HIT, pan: k % 2 ? .12 : -.12});
  thump(mix, u2.failure, THUMP_BB, .9, {...HIT, pan: 0}, {double: true});
  breath(mix, u2.backtrack.at, u2.backtrack.duration, AIR, {level: .1, from: 250, to: 900, pan: [.3, -.3]});
  u2.drawers.forEach((time, i) => tick(mix, time, .5, {...HIT, pan: i % 2 ? .3 : -.3}, 1800 + 120 * i));
  // The warning is the film's only wrong note: an A♮ pop against the A♭.
  pop(mix, u2.warning, 69, .55, {...HIT, pan: .15});
  tick(mix, u2.warning + .002, .35, {...HIT, pan: .15});
  for (let t = u2.highlight.at + .3, k = 0; t < u2.insights + .4; t += .65, k++) tick(mix, t, .22, {...HIT, pan: k % 2 ? .3 : -.3}, 1700);
  breath(mix, u2.cloudIn.at + 1, u2.cloudIn.duration - 1, AIR, {level: .06, from: 220, to: 700, peak: .6, pan: [-.3, .2]});
  // Thousands of traces: a sparse cascade of high pops that thickens with the zoom.
  for (let t = u2.zoom.at + .3, k = 0; t < u2.collapse.at; k++) {
    const x = (t - u2.zoom.at) / (u2.collapse.at - u2.zoom.at);
    pop(mix, t, PENTA[(k * 3) % PENTA.length], .08 + .14 * x, {...HIT, pan: (mix.random() - .5) * .7});
    t += 1 / (5 + 9 * x) * (.7 + .6 * mix.random());
  }
  thump(mix, u2.collapse.at + u2.collapse.duration * .8, THUMP_DB, .95, {...HIT, pan: 0});
  // The cloud settles: droplets falling out of it.
  [.25, .9, 1.4, 2.1, 2.6].forEach((dt, i) => droplet(mix, afterCollapse + dt, .55 - .05 * i, {...HIT, pan: [-.2, .15, -.05, .2, -.15][i]}, 420 - 25 * i, 180 - 8 * i));
  // "If only": a soft ping-pong of high clicks.
  for (let t = u2.ifOnly - .2, k = 0; t < cues.chapter.cost.start; t += .4, k++) click(mix, t, .5, {...HIT, pan: k % 2 ? .6 : -.6});

  // ── Cost. A falling droplet per cheap pass, a sour pop for the issues they miss, the bash lands on a double thump.
  cost.cheapLegs.forEach((leg, i) => droplet(mix, leg.at + leg.duration * .7, .5, {...HIT, pan: leg.direction === 'leftToRight' ? .35 : -.35}, 380 - 30 * i, 170 - 10 * i));
  pop(mix, cost.missIssues + .3, 61, .45, {...HIT, pan: -.05});
  droplet(mix, cost.missIssues + .36, .4, {...HIT, pan: -.05}, 300, 130);
  thump(mix, cost.bashStop, THUMP_BB, 1, LATE_THUMP, {double: true});
  [Eb5, 71, Ab4].forEach((midi, i) => pop(mix, cost.bashDescent.at + i * cost.bashDescent.duration / 3, midi, .38 - i * .04, {...HIT, pan: .15 - i * .15}));
  breath(mix, cost.cameraToBudget.at, cost.cameraToBudget.duration * .6, AIR, {kind: 'feather', level: .08, from: 1500, to: 6000, peak: .7, pan: [-.2, .2]});
  pop(mix, cost.budgetAppear, Eb4, .4, {...HIT, pan: 0});
  // The budget runs down as a quiet high ratchet that stops before the bed does.
  dots(mix, cost.depletion.at, silence - .1, HIT, {rate: 11, level: [1, .3], pan: [.2, -.2]});

  // ── Flow-1. Two hard-left clicks as it lands, a thump under the bass entry, pops on the numbers.
  thump(mix, reveal, THUMP_AB, 1, LATE_THUMP, {click: 1.4});
  click(mix, flow.native, .8, {...HIT, pan: -.75});
  click(mix, flow.native + .07, .6, {...HIT, pan: -.75});
  pop(mix, drops[0], 80, .45, {...HIT, pan: .15});
  pop(mix, drops[0] + .004, Ab4, .35, {...HIT, pan: -.1});
  pop(mix, drops.at(-1)!, Eb5, .35, {...HIT, pan: -.15});
  [0, .25, .5].forEach((dt, i) => tick(mix, flow.engineSpinner.at + dt, .32, {...HIT, pan: [-.2, .2, 0][i]}, 1900));
  pop(mix, flow.moduleActivation, Eb5, .4, {...HIT, pan: 0});
  thump(mix, flow.coverShut, THUMP_AB, .9, LATE_THUMP);

  // ── Issues. One pillow at the turn, a double thump for the bash, label pops, then a swell into the grid.
  breath(mix, cues.chapter.issues.start, .7, AIR, {level: .1, from: 300, to: 1000, peak: .55, pan: [-.15, .15]});
  thump(mix, prelude.bashStop, THUMP_BB, .85, LATE_THUMP, {double: true});
  [Eb5, C5, Ab4].forEach((midi, i) => pop(mix, prelude.descent.at + i * prelude.descent.duration / 3, midi, .3 - i * .03, {...HIT, pan: .15 - i * .15}));
  if (prelude.bubble !== undefined) pop(mix, prelude.bubble, Eb5, .4, {...HIT, pan: -.15});
  const labels = prelude.labels;
  if (labels) [Ab4, C5, Eb5].forEach((midi, i) => pop(mix, labels.at + i * labels.duration / 3, midi, .32, {...HIT, pan: -.15 + i * .15}));
  breath(mix, prelude.zoomOut.at, prelude.zoomOut.duration, AIR, {level: .09, from: 900, to: 300, peak: .35, pan: [.25, -.25]});
  breath(mix, prelude.circleGrow.at, native - prelude.circleGrow.at + .1, AIR, {level: .08, from: 250, to: 1100, peak: .9, pan: [0, 0]});
  thump(mix, native, THUMP_AB, .95, LATE_THUMP);
  // The 47 triangles: the tallest twelve as a soft pop shower on the pentatonic.
  [...issues.pops].sort((a, b) => b.height - a.height).slice(0, 12).sort((a, b) => a.at - b.at).forEach((p, i) =>
    pop(mix, p.at + i * .025, PENTA[Math.min(PENTA.length - 1, Math.floor(p.height * PENTA.length))], .1 + .2 * p.height, {...HIT, pan: p.pan * .6}));
  issues.clusters.forEach((time, i) => droplet(mix, time + i * .06, .45, {...HIT, pan: -.5 + i * .2}, 520 - 30 * i, 210 - 10 * i));

  // ── Logo. The high cluster swells in reverse into the bloom; one soft thump, no stab under "with Laminar".
  tapePad(mix, logo - 1.6, logo, [70, 75, 79, 82], {...PAD, hall: .35}, {attack: 1.6, release: .05, cutoff: [500, 2000], level: .35, curve: 2.4, breath: 0});
  thump(mix, logo, THUMP_AB, .6, LATE_THUMP, {click: .5});
}

/** The agent window in the Issues postlude: pillow slides, a thump when it shuts, ticks for typing, droplets and pops for the badges. */
export function designCursorV3(mix: Mix, cues: ScoreCues) {
  const issues = cues.issues;
  if (!issues.postludeActive) return;
  breath(mix, issues.windowDown.at, issues.windowDown.duration + .05, AIR, {level: .08, from: 900, to: 350, peak: .35});
  thump(mix, issues.windowShut, 49, .6, LATE_THUMP, {click: .6});
  if (mix.typingEnabled) issues.typingEvents.forEach((event, i) =>
    tick(mix, event.time, .47 * (.8 + .4 * mix.random()), {...HIT, pan: .15 * Math.sin(i * 1.7)}, 1650 + 300 * mix.random()));
  droplet(mix, issues.issueBadge, .45, {...HIT, pan: -.2}, 480, 200);
  droplet(mix, issues.messageSend, .35, {...HIT, pan: .2}, 420, 190);
  pop(mix, issues.queryBadge, 72, .38, {...HIT, pan: .2});
  breath(mix, issues.windowUp.at, issues.windowUp.duration + .05, AIR, {level: .07, from: 350, to: 900, peak: .6});
}
