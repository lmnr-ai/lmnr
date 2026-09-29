import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bowed, clap, piano, pizz, type Mix, type Route} from '../voices';
import {cascade, chordAt, loopBars, type Chord, type Progression} from '../writing';
import {glock, stomp, tambourine} from './instruments';

/*
 * "Stomp & glock" — C major indie-folk keynote pop. Foot stomps on a wooden stage and a handclap backbeat,
 * a tambourine, sampled pizzicato strings chugging in eighths and a dry piano pulse; the glockenspiel
 * carries every tune above the voice. Before Flow-1 it walks vi – IV – I – V with half the band; Flow-1
 * resolves onto C with the whole room stomping, a glockenspiel hook and the violins lifting under it.
 */

const GLOCK: Route = {bus: 'music', hall: .3, delay: .16};
const PIZZ: Route = {bus: 'music', hall: .2, room: .1};
const KEYS: Route = {bus: 'music', hall: .14, room: .14};
const BOW: Route = {bus: 'music', hall: .5};
const FEET: Route = {bus: 'music', room: .45, hall: .1};
const HANDS: Route = {bus: 'music', room: .3, hall: .16};
const LOW: Route = {bus: 'music', hall: .06, gain: .65};

const C: Chord = {bass: 48, tones: [55, 60, 64]}, G: Chord = {bass: 43, tones: [55, 59, 62]}, Am: Chord = {bass: 45, tones: [57, 60, 64]};
const F: Chord = {bass: 41, tones: [57, 60, 65]}, Em: Chord = {bass: 40, tones: [55, 59, 64]};
const EASY = [Am, F, C, G], SHINE = [C, G, Am, F], DOOR = [F, G, Em, Am];
/** Pizz chug per bar in eighths: root, fifth, octave, third… over the chord. */
const CHUG = [0, 2, 1, 2, 0, 2, 3, 2];
/** The glockenspiel hook over I → V. */
const HOOK = [[0, 88, .5], [.5, 84, .5], [1, 79, .5], [1.5, 84, .5], [2, 86, 1], [3, 84, .5], [3.5, 83, .5], [4, 86, .5], [4.5, 83, .5], [5, 79, .5], [5.5, 83, .5], [6, 86, 2]] as const;
const THEME = [[0, 84, .5], [.5, 86, .5], [1, 88, 1], [2, 91, .5], [2.5, 88, 1.5]] as const;

const lastBar = (bars: Progression, chord: Chord): Progression => bars.map(([beat, c], i) => [beat, i === bars.length - 1 ? chord : c] as const);

export function composeStomp(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const drop = at(flow.reveal, 1), shut = flow.coverShut, shutBeat = beatAt(shut);
  const home = drop + 4 * Math.round((beatAt(issues.native) - drop) / 4), logo = at(end.logo, 1);
  const steps = (from: number, to: number, division: number, play: (beat: number, s: number, t: number) => void) => {
    for (let step = Math.ceil(from * division - 1e-9); step < to * division - 1e-9; step++)
      play(step / division, ((step - drop * division) % (4 * division) + 4 * division) % (4 * division), g(step / division) + (mix.random() - .5) * .008);
  };

  const bells = (time: number, notes: readonly number[], step: number, velocity: number, pan = 0) =>
    notes.forEach((midi, i) => glock(mix, time + i * step, midi, velocity, {...GLOCK, pan: pan - .3 + .6 * i / Math.max(1, notes.length - 1)}, {decay: .9}));
  const tune = (beat: number, notes: readonly (readonly [number, number, number])[], velocity: number, shift = 0) =>
    notes.forEach(([b, midi, length]) => glock(mix, g(beat + b) + (mix.random() - .5) * .006, midi + shift, velocity, {...GLOCK, pan: .15}, {decay: .6 + length * .4}));
  const plucked = (time: number, notes: readonly number[], step: number, velocity: number, pan = 0) =>
    notes.forEach((midi, i) => pizz(mix, time + i * step, midi, velocity, {...PIZZ, pan: pan + (i % 2 ? .12 : -.12)}));

  /** Pizz chugging eighths; the half band plays only the downbeats and the "and" of two. */
  const chug = (bars: Progression, from: number, to: number, full: boolean, level = 1) => steps(from, to, 2, (beat, e, t) => {
    if (!full && e !== 0 && e !== 3 && e !== 4) return;
    const [, chord] = chordAt(bars, beat), voice = [chord.bass + 12 < 50 ? chord.bass + 12 : chord.bass, ...chord.tones];
    pizz(mix, t, voice[CHUG[e]], (e % 2 ? .4 : .55) * level, {...PIZZ, pan: e % 2 ? .3 : -.3});
  });
  /** Piano: a short chord per beat under the full band, one held chord per bar under the half band; the left hand plays the root. */
  const keys = (bars: Progression, from: number, to: number, full: boolean) => steps(from, to, 1, (beat, b, t) => {
    const [, chord] = chordAt(bars, beat), root = chord.bass < 40 ? chord.bass : chord.bass - 12;
    if (b === 0 || (full && b === 2)) piano(mix, t, root, .3, LOW, {length: .9, bright: .3});
    if (full) chord.tones.forEach((midi, i) => piano(mix, t + i * .004, midi, (b % 2 ? .1 : .13), {...KEYS, pan: -.2 + i * .2}, {length: .3, bright: .3}));
    else if (b === 0) chord.tones.forEach((midi, i) => piano(mix, t + i * .01, midi, .13, {...KEYS, pan: -.2 + i * .2}, {length: 1.6, bright: .3}));
  });
  /** Tier 1: stomps on one and three, tambourine on the offbeats; 2 claps two and four; 3 is the whole room. */
  const room = (from: number, to: number, tier: 1 | 2 | 3, level = 1) => steps(from, to, 4, (_, s, t) => {
    if (s === 0 || s === 8 || (tier === 3 && s === 6)) stomp(mix, t, (s === 6 ? .28 : .36) * level, {...FEET, pan: s === 6 ? .1 : -.05});
    if (tier >= 2 && (s === 4 || s === 12)) {
      clap(mix, t, .2 * level, {...HANDS, pan: -.2});
      clap(mix, t + .011, .16 * level, {...HANDS, pan: .25});
    }
    if (s % 4 === 2) tambourine(mix, t, (tier === 1 ? .12 : .16) * level, {...HANDS, pan: .35}, .07);
    else if (tier === 3 && s % 2) tambourine(mix, t, .06 * level, {...HANDS, pan: .35}, .03);
  });

  // ── You build agents: a C chord on the piano, the glockenspiel ringing up over it.
  [36, 48, 55, 60, 64, 67].forEach((midi, i) => piano(mix, u2.agentEnter + .05 + i * .03, midi, .26, {...KEYS, pan: -.3 + i * .12}, {length: 3.6, bright: .35}));
  bells(u2.agentEnter + .7, [84, 88, 91], .12, .2, .2);

  // ── From the first trace: stomps, tambourine, pizz and piano; the claps join on the insights; the last bar is G.
  const from = at(u2.stream.at), insights = at(u2.insights, 1), depletion = at(cost.depletion.at);
  const easy = lastBar(loopBars(from, drop, EASY, drop), G);
  chug(easy, Math.ceil(from), depletion, false);
  keys(easy, Math.ceil(from), drop, false);
  room(Math.ceil(from), insights, 1);
  room(insights, depletion, 2);

  // ── When your agent fails: pizz falling; the upward turn climbs; the backtrack is the glockenspiel rewinding.
  plucked(u2.failure, [72, 69, 67, 64], .13, .6);
  plucked(u2.upwardTurn.at + .1, [60, 64, 67], u2.upwardTurn.duration / 3, .55, -.1);
  bells(u2.backtrack.at, [96, 93, 91, 88, 84, 81, 79, 76], .05, .15);
  u2.drawers.forEach((time, i) => glock(mix, time, [79, 84, 88][i], .2 + i * .03, {...GLOCK, pan: -.2 + i * .2}));
  bells(u2.highlight.at, [91], 0, .2, .25);

  // ── The insights: the glockenspiel's motif; the zoom climbs; "if only" leaves a D hanging.
  tune(insights + 1, THEME, .22);
  bells(u2.zoom.at + .4, [72, 74, 76, 79, 81, 84, 86, 88, 91], (u2.zoom.duration - .4) / 9, .13);
  bells(u2.ifOnly + .1, [86], 0, .22, .3);

  // ── Cheap LLMs: a pizz flick per pass; the miss droops. Powerful LLMs: a low stomp-and-octave on the bash window.
  cost.cheapLegs.forEach(leg => plucked(leg.at, leg.direction === 'leftToRight' ? [67, 69, 72, 76] : [76, 72, 69, 67], leg.duration / 4, .5, leg.direction === 'leftToRight' ? -.3 : .3));
  plucked(cost.missIssues + .1, [71, 67], .25, .5);
  stomp(mix, cost.bashStop, .4, FEET);
  piano(mix, cost.bashStop, 33, .36, LOW, {length: 1, bright: .3});
  bells(cost.budgetAppear, [88], 0, .2, -.1);

  // ── …but the costs are unsustainable: the room goes quiet under the piano, the glockenspiel sinks;
  // until now, a two-bar stomp-and-clap build into the downbeat, the violins swelling on G.
  [[0, 88], [1, 84], [2, 81], [3, 76]].forEach(([b, midi]) => glock(mix, g(depletion + b), midi, .2, {...GLOCK, pan: .2}, {decay: 1}));
  chug(easy, depletion, drop - 2, false, .7);
  steps(drop - 4, drop, 2, (beat, e, t) => {
    const lift = (beat - drop + 4) / 4;
    stomp(mix, t, .14 + .2 * lift, {...FEET, pan: e % 2 ? .1 : -.05});
    if (beat >= drop - 2) clap(mix, t + .006, .06 + .14 * lift, {...HANDS, pan: e % 2 ? .25 : -.2});
  });
  bowed(mix, g(drop - 4), flow.reveal + .1, 67, {...BOW, pan: -.15}, {section: 'violins', attack: .5, dynamics: [.15, .6], release: .4});
  bowed(mix, g(drop - 4), flow.reveal + .1, 71, {...BOW, pan: .15}, {section: 'violins', attack: .5, dynamics: [.1, .5], release: .4});

  // ── Introducing Flow-1: C major, the whole room — stomps, claps, chugging pizz, piano on every beat, the hook.
  const shine = loopBars(drop, shutBeat, SHINE, drop);
  stomp(mix, flow.reveal, .42, FEET);
  [36, 48, 60, 64, 67, 72].forEach((midi, i) => piano(mix, flow.reveal + i * .012, midi, .28, {...KEYS, pan: -.3 + i * .12}, {length: 2, bright: .4}));
  chug(shine, drop, shutBeat, true);
  keys(shine, drop + 1, shutBeat, true);
  room(drop, shutBeat, 3);
  tune(drop, HOOK, .26);
  bowed(mix, flow.reveal, g(drop + 8), 76, {...BOW, pan: .2}, {section: 'violins', attack: .5, dynamics: [.55, .3], release: 1.6});
  bowed(mix, flow.reveal + .05, g(drop + 8), 72, {...BOW, pan: -.2}, {section: 'violins', attack: .5, dynamics: [.45, .25], release: 1.6});
  // Matching Sonnet-5 at 2% of the cost: glockenspiel on the zoom; bead landings climb (flow-1's, the third, rings long), the bars glissando.
  bells(flow.cameraZoom.at, [84, 88], .12, .18);
  if (flow.animation21) {
    flow.numberDrops.forEach((time, i) => glock(mix, time, [81, 84, 86, 88, 91, 93][i], i === 2 ? .26 : .17, {...GLOCK, pan: -.3 + i * .12}, {decay: i === 2 ? 1.8 : .9}));
    plucked(flow.numberDrops[2], [60, 72], .01, .6);
  } else plucked(flow.numberSwap.at, [60, 72], .01, .6);
  bells(flow.barsGrow.at, [76, 79, 81, 84, 86, 88, 91, 93, 96], flow.barsGrow.duration / 9, .17);
  // Flow-1 powers Signals: the motif again; the door shuts on a stomp and a pizz chord.
  tune(at(flow.cameraToEngine.at, 1), THEME, .24);
  stomp(mix, shut, .34, FEET);
  plucked(shut, [53, 60, 65, 69], .012, .5);

  // ── Our agent, built to analyze traces at scale: behind the door, stomps and claps, the half band.
  const door = lastBar(loopBars(Math.ceil(shutBeat + .5), home, DOOR, home), G), p = issues.prelude;
  chug(door, door[0][0], home, true, .8);
  keys(door, door[0][0], home, false);
  room(door[0][0], home - 1, 2);
  steps(home - 1, home, 4, (beat, s, t) => stomp(mix, t, .12 + .1 * (beat - home + 1), {...FEET, pan: s % 2 ? .1 : -.05}));
  piano(mix, p.bashStop, 36, .34, LOW, {length: 1, bright: .3});
  bells(p.descent.at, [96, 93, 91, 88, 84, 81, 79, 76], p.descent.duration / 8, .14);
  glock(mix, p.highlight, 91, .22, {...GLOCK, pan: .2});
  // "At scale": the glockenspiel climbs with the zoom out; the motif grows with the circle; the scale-out is the pickup home.
  bells(p.zoomOut.at, [72, 74, 76, 79, 81, 84, 86, 88, 91, 93], p.zoomOut.duration / 10, .12);
  tune(at(p.circleGrow.at, 1), THEME, .22);
  plucked(p.scaleOut, [60, 64, 67, 72, 76], .07, .5, -.2);

  // ── It finds deep issues, in every trace: the whole room again; the last bar is G.
  const homeBars = lastBar(loopBars(home, logo, SHINE, logo), G);
  chug(homeBars, home, logo, true);
  keys(homeBars, home, logo, true);
  room(home, logo - 1, 3);
  if (issues.postludeActive) {
    // Issue triangles land on the glockenspiel, falling down the pentatonic.
    cascade(issues.pops, [76, 79, 81, 84, 86, 88, 91, 93, 96]).forEach((note, i) => glock(mix, note.time, note.midi, .2 - i * .008, {...GLOCK, pan: note.pan * .85}, {decay: .8}));
    // …and clusters them into patterns: a pizz chord on the lock; ready for you, the glockenspiel settles.
    const [, locked] = chordAt(homeBars, beatAt(issues.clusters[0]));
    plucked(issues.clusters[0], locked.tones.map(t => t + 12), .012, .5);
    const ready = at(issues.ready, 1);
    tune(ready, [[0, 88, 1.5], [1.5, 86, .5], [2, 84, 2]], .22);
  }

  // ── Unlock the insights: the hook's first bar an octave down on pizz and glock, the room clapping into the logo.
  tune(at(end.start, 1) + .5, HOOK.slice(0, 6), .22);
  HOOK.slice(0, 6).forEach(([b, midi]) => pizz(mix, g(at(end.start, 1) + .5 + b), midi - 12, .45, {...PIZZ, pan: -.15}));
  for (let n = 0; n < 4; n++) clap(mix, g(logo - 1 + n * .25), .08 + n * .04, {...HANDS, pan: -.2 + n * .12});

  // ── With Laminar: C major — one last stomp, the piano chord ringing, the violins and a glockenspiel sparkle.
  stomp(mix, end.logo, .42, FEET);
  clap(mix, end.logo + .01, .18, HANDS);
  [36, 48, 55, 60, 64, 67, 72, 76].forEach((midi, i) => piano(mix, end.logo + i * .014, midi, .3 - i * .01, {...KEYS, pan: -.35 + i * .1}, {length: end.end - end.logo, bright: .4}));
  bowed(mix, end.logo, end.end - 1, 76, {...BOW, pan: .2}, {section: 'violins', attack: .5, dynamics: [.5, .15], release: 1});
  bowed(mix, end.logo, end.end - 1, 67, {...BOW, pan: -.2}, {section: 'violins', attack: .5, dynamics: [.4, .12], release: 1});
  bells(end.logo + .4, [84, 88, 91, 96], .16, .18);
}
