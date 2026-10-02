import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import type {Mix} from '../voices';
import {CHORUS, bassLine, bed, type BedKey} from './bed';
import {HIGH, I, IV, V} from './composition';
import {tapePad} from './instruments';
import {breath, click, dots, droplet, pop, swellKey, thump, tick} from './tactile';
import {AIR, BASS, HIT, KEYS, LATE_THUMP, PAD, repeats, shelveLows} from './composition-v3';

/*
 * LAM-2317 v4: v3's language, re-staged to build the way the Cursor reference does. Its first half is a
 * low plateau with no bass; the bass enters on a +3–4 LU step at the midpoint; it dips at 75 % and opens
 * its top to a peak at ~92 %. So here Act 1 and Cost hold back a voice and the bass, "Until now" sits on
 * the dominant so the Flow-1 reveal resolves V → I with the first sustained low end, Issues is capped, and
 * the conclusion brightens through IV–V–I to the logo, which resolves after the last word and rings out.
 */

const ivMinor = [56, 59, 61, 63];
const IV_HIGH = [61, 63, 65, 68, 72];
const BLOOM = [48, 55, 60, 63, 67, 70, 75, 79, 80];
const PENTA = [63, 65, 68, 70, 72, 75, 77, 80];
const [Ab2, Db2, Eb2] = [44, 37, 39];
// Thump pitches: A♭2, B♭2 and D♭3 (104, 117 and 139 Hz), the reference's thump register.
const [THUMP_AB, THUMP_BB, THUMP_DB] = [44, 46, 49];

/** The end of the last spoken word; the logo resolves after it. */
export const wordEndOf = (cues: ScoreCues) => Math.max(cues.conclusion.logo + 1, ...cues.voice.map(phrase => phrase.at + phrase.duration));

/** With `urlCard` (v5) the logo keys ring on through the laminar.sh card while the bed and bass step back. */
export function composeCursorV4(mix: Mix, cues: ScoreCues, {urlCard = false} = {}) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, prelude = issues.prelude, end = cues.conclusion;
  const reveal = flow.reveal, toAnalysis = flow.cameraToAnalysis.at + flow.cameraToAnalysis.duration * .5;
  const engine = flow.cameraToEngine.at + flow.cameraToEngine.duration * .6;
  const native = issues.native, logo = end.logo, half = end.start + (logo - end.start) * .5;
  const silence = cost.depletion.at + cost.depletion.duration - .2, afterCollapse = u2.collapse.at + u2.collapse.duration;
  const wordEnd = wordEndOf(cues), drops = [...flow.numberDrops].sort((a, b) => a - b);
  const url = urlCard ? end.url : undefined;

  // ── The undercurrent. No sustained low end before the reveal, and cutoffs that open only in the conclusion.
  const keys: BedKey[] = [
    {at: u2.agentEnter, notes: HIGH, fade: 2, cutoff: 750, level: .7, breath: .06},
    {at: u2.failure, glide: .6, cutoff: 450, bend: -.5, bendTime: .6},
    {at: u2.upwardTurn.at, notes: IV_HIGH, fade: 1.2, glide: 1, cutoff: 850, bend: 0, bendTime: 1},
    {at: u2.insights, notes: HIGH, fade: 2.2, cutoff: 1000, level: .8},
    {at: cost.cloudOut.at + .3, notes: ivMinor, fade: 1.6, cutoff: 650, level: .75},
    {at: cost.bashStop, notes: ivMinor, fade: .1, glide: .3, cutoff: 950},
    {at: cost.depletion.at, glide: cost.depletion.duration, cutoff: 300, bend: -2, bendTime: cost.depletion.duration},
    {at: silence, notes: [], fade: .2},
    // "Until now" holds B♭ and D♭ of the dominant, so the reveal resolves.
    {at: silence + .25, notes: [70, 73], fade: .5, glide: .01, cutoff: 1200, level: .2, bend: 0, bendTime: .01},
    {at: reveal, notes: [...I, 72, 75], fade: .12, glide: .4, cutoff: 1400, level: .8},
    {at: toAnalysis - .4, notes: IV, fade: 1.6, glide: 1.6, cutoff: 1300, level: .75},
    {at: engine, notes: V, fade: .6, cutoff: 1300},
    {at: flow.coverShut + .1, notes: I, fade: 1.4, cutoff: 1200, level: .7},
    {at: prelude.zoomOut.at + .3, notes: V, fade: 1.4, cutoff: 1200, level: .75},
    {at: native, notes: I, fade: .1, glide: .3, cutoff: 1300, level: .8},
    {at: end.start, notes: IV, fade: 1, glide: 1.5, cutoff: 1600, level: .75},
    {at: half, notes: V, fade: .8, glide: logo - half, cutoff: 2000, level: .8},
    {at: logo, notes: BLOOM, fade: .5, glide: .5, cutoff: 1800, level: .7},
    // After "with Laminar", every G steps up to A♭: the home chord, then a slow darkening ring.
    {at: wordEnd, notes: [51, 56, 60, 63, 68, 72, 75, 80], fade: 1.8, glide: 1.2, cutoff: 1900, level: .8},
    {at: logo + 3, glide: 4, cutoff: 1000},
    ...(url === undefined ? [] : [{at: url, glide: 3, cutoff: 700, level: .5}]),
  ];
  bed(mix, keys, PAD, CHORUS);
  bassLine(mix, [
    {at: 0, midi: null, fade: .01, level: 0},
    {at: silence + .3, midi: Eb2, fade: 1.2, level: .3},
    {at: reveal, midi: Ab2, fade: .06, level: .9},
    {at: toAnalysis - .2, midi: Db2, fade: .8},
    {at: engine, midi: Eb2, fade: .3, level: .95},
    {at: flow.coverShut + .1, midi: Ab2, fade: 1, level: .75},
    {at: prelude.zoomOut.at + .3, midi: Eb2, fade: .9, level: .8},
    {at: native, midi: Ab2, fade: .05, level: .9},
    {at: end.start, midi: Db2, fade: .7, level: .9},
    {at: half, midi: Eb2, fade: .6, level: .95},
    {at: logo, midi: Ab2, fade: .3, level: .6},
    {at: wordEnd, midi: Ab2, fade: 1.5, level: .75},
    ...(url === undefined ? [] : [{at: url, midi: Ab2, fade: 3, level: .4}]),
  ], BASS);
  shelveLows(mix, [u2.failure, u2.collapse.at + u2.collapse.duration * .8, cost.bashStop, reveal, flow.coverShut, prelude.bashStop, native, logo]);

  // ── The melody: soft keys that swell in and repeat, the reference's E♭ → A♭ → G cell, following the story.
  const [Eb4, F4, G4, Ab4, Bb4, C5, Eb5] = [63, 65, 67, 68, 70, 72, 75], [Eb3, Ab3] = [51, 56];
  repeats(mix, [
    // Act 1 starts on two voices; the third arrives with the insights.
    {from: u2.firstThinking.at, to: u2.upwardTurn.at, voices: [Eb4, Ab4]},
    {from: u2.upwardTurn.at, to: u2.insights, voices: [Eb4, Ab4]},
    {from: u2.insights, to: u2.collapse.at, voices: [Eb4, Ab4, [G4, G4, C5]], level: .85},
    // The collapse thins the cell to two voices, and the top climbs to C5 for "If only".
    {from: afterCollapse, to: u2.ifOnly, voices: [Ab4, C5], level: .8},
    {from: u2.ifOnly, to: cost.cloudOut.at + .3, voices: [G4, C5], period: 1, level: .85},
    // Cost: two voices, the lower sinking through the borrowed minor, gone at the depletion.
    {from: cost.cloudOut.at + .6, to: cost.depletion.at, voices: [Ab4, [Eb4, Eb4, 61, 59]], level: .75},
    // "Until now": an E♭3 pulse, the held breath, moving to A♭3 on the reveal and running through the number drops.
    {from: silence + .3, to: reveal, voices: [Eb3], period: .5, level: .45, swell: .12},
    {from: reveal, to: Math.max(drops.at(-1)!, flow.cameraZoom.at + 1.2), voices: [Ab3], period: .5, level: .38, swell: .12},
    {from: reveal + .15, to: toAnalysis - .4, voices: [Eb4, Ab4, G4], level: .84},
    {from: toAnalysis - .4, to: engine, voices: [Eb4, Ab4, F4], level: .95},
    {from: engine, to: flow.coverShut, voices: [Eb4, Bb4, G4], level: .95},
    // The analysis under dense narration: two voices only.
    {from: cues.chapter.issues.start, to: prelude.zoomOut.at + .3, voices: [Eb4, Ab4], period: .95, level: .75},
    {from: prelude.zoomOut.at + .3, to: native, voices: [Eb4, Bb4, G4], level: .85},
    {from: native + .1, to: end.start, voices: [Eb4, Ab4, [G4, C5]], level: .8},
    {from: end.start, to: half, voices: [Eb4, Ab4, F4], level: .8},
    {from: half, to: logo - .2, voices: [Eb4, Bb4, G4], period: .7, level: 1},
  ]);
  // Accents: C5 and E♭5 on the number drops, an E♭5/B♭5 lift on the cover.
  swellKey(mix, drops[0], C5, .92, {...KEYS, pan: .2}, .1);
  swellKey(mix, drops.at(-1)!, Eb5, .84, {...KEYS, pan: -.2}, .1);
  swellKey(mix, flow.coverShut + .05, Eb5, 1, {...KEYS, pan: .25}, .2, 2);
  swellKey(mix, flow.coverShut + .12, Bb4, .9, {...KEYS, pan: -.25}, .2, 2);
  // The reveal resolves D♭5 → C5 over A♭, held long.
  tapePad(mix, reveal - 1.2, reveal, [63, 70, 73], {...PAD, hall: .3}, {attack: 1.2, release: .05, cutoff: [500, 1600], level: .3, curve: 2.4, breath: 0});
  swellKey(mix, reveal, C5, .95, {...KEYS, pan: .1}, .06, 3.2, 1.4);
  swellKey(mix, reveal + .03, Ab4, .8, {...KEYS, pan: -.1}, .06, 3.2, 1.4);
  // The conclusion: a high shimmer opens over IV–V, and a top line climbs F5 → G5 → A♭5 into the logo.
  tapePad(mix, end.start, logo, [75, 77, 82], {...PAD, hall: .4}, {attack: 2.5, release: 1, cutoff: [900, 2400], level: .22, curve: 1.5, breath: .05});
  swellKey(mix, end.start + .1, 77, .7, {...KEYS, pan: .1}, .4, 2.6, 1.2);
  swellKey(mix, half, 79, .75, {...KEYS, pan: -.1}, .4, 2.4, 1.2);
  // The logo rings for ~5 s instead of ~1.5: A♭4, E♭5 and A♭5, then C5 once the last word ends.
  const ring = url === undefined ? 5.5 : cues.duration - logo;
  swellKey(mix, logo, Ab4, 1, {...KEYS, pan: -.15}, .3, ring, 2.2);
  swellKey(mix, logo + .04, Eb5, .92, {...KEYS, pan: .15}, .3, ring, 2.2);
  swellKey(mix, logo + .08, 80, .6, {...KEYS, pan: 0}, .5, ring, 2.2);
  swellKey(mix, wordEnd + .05, C5, .6, {...KEYS, pan: .05}, .5, url === undefined ? 5.5 : cues.duration - wordEnd - .05, 2.5);

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
  thump(mix, native, THUMP_AB, .8, LATE_THUMP);
  // The 47 triangles: the tallest twelve as a soft pop shower on the pentatonic.
  [...issues.pops].sort((a, b) => b.height - a.height).slice(0, 12).sort((a, b) => a.at - b.at).forEach((p, i) =>
    pop(mix, p.at + i * .025, PENTA[Math.min(PENTA.length - 1, Math.floor(p.height * PENTA.length))], .1 + .2 * p.height, {...HIT, pan: p.pan * .6}));
  issues.clusters.forEach((time, i) => droplet(mix, time + i * .06, .45, {...HIT, pan: -.5 + i * .2}, 520 - 30 * i, 210 - 10 * i));

  // ── Logo. The high cluster swells in reverse into the bloom; one soft thump, no stab under "with Laminar".
  tapePad(mix, logo - 1.6, logo, [70, 75, 79, 82], {...PAD, hall: .35}, {attack: 1.6, release: .05, cutoff: [500, 2000], level: .35, curve: 2.4, breath: 0});
  thump(mix, logo, THUMP_AB, .6, LATE_THUMP, {click: .5});
}

/**
 * v5's afterword on the laminar.sh cut: an A♭ add9 re-strike under the logo's velocities and a faint A♭5 tick.
 * It runs after design, so every random draw of v4's compose and design is unchanged.
 */
export function urlCardCursorV5(mix: Mix, cues: ScoreCues) {
  const url = cues.conclusion.url;
  if (url === undefined) return;
  swellKey(mix, url, 75, .5, {...KEYS, pan: .12}, .25, cues.duration - url, 2.6);
  swellKey(mix, url + .06, 82, .32, {...KEYS, pan: -.12}, .4, cues.duration - url - .06, 2.6);
  pop(mix, url, 80, .2, {...HIT, pan: 0});
}
