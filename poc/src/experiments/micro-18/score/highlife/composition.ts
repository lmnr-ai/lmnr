import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bell, clap, kick, shaker, snare, type Mix, type Route} from '../voices';
import {cascade, chordAt, loopBars, type Chord, type Progression} from '../writing';
import {brass, guitar, strum, synthBass} from '../city-pop/instruments';
import {balafon, conga} from './instruments';

/*
 * "Highlife sunshine" — G major, after West African highlife and its guitar bands. Two clean guitars
 * interlock: a high single-note line twinkling through the triad and offbeat chanks under it, over a bell
 * pattern, a shaker, hand drums and a bass that skips across the bar. Before Flow-1 the drums are just
 * congas and bell; Flow-1 brings the kick, backbeat and a horn riff in thirds. The picture is answered on
 * a balafon, whose woody attack sits above the voice rather than on it.
 */

const LINE_GTR: Route = {bus: 'music', hall: .14, room: .1, delay: .1, pan: .38};
const CHANK: Route = {bus: 'music', hall: .1, room: .14, pan: -.36};
const WOOD: Route = {bus: 'music', hall: .26, room: .08, delay: .14};
const HORNS: Route = {bus: 'music', hall: .24, room: .1};
const HANDS: Route = {bus: 'music', room: .22, hall: .05};
const KIT: Route = {bus: 'music', room: .14};
const DRUM: Route = {...KIT, gain: .75};
const LOW: Route = {bus: 'music', gain: .6};

const G: Chord = {bass: 43, tones: [55, 59, 62]}, C: Chord = {bass: 48, tones: [55, 60, 64]}, D: Chord = {bass: 50, tones: [54, 57, 62]};
const Em: Chord = {bass: 40, tones: [55, 59, 64]}, Am: Chord = {bass: 45, tones: [57, 60, 64]};
const EASY = [G, C, G, D], SHINE = [C, D, G, Em], DOOR = [Am, D, G, C];
/** The high guitar's line per bar: [16th, degree] over root – third – fifth and the octave above. */
const LINE = [[0, 3], [2, 2], [3, 1], [4, 2], [6, 0], [7, 1], [8, 2], [10, 3], [11, 4], [12, 3], [14, 2], [15, 1]] as const;
/** Bell: a 3-3-4-2-4 clave, high – low – high – low – high. */
const BELL = [[0, 91], [3, 86], [6, 91], [10, 86], [12, 91]] as const;
/** The bass skips root – fifth – octave – root – fifth – octave across the bar. */
const SKIP = [[0, 0, .3], [3, 7, .2], [6, 12, .2], [8, 0, .3], [11, 7, .2], [14, 12, .15]] as const;
/** Horn riff over IV → V, harmonised a diatonic third below. */
const RIFF = [[0, 76, .5], [.5, 79, .5], [1, 76, .25], [1.5, 74, .5], [2, 72, .75], [3, 74, .25], [3.5, 76, .5], [4, 78, .5], [4.5, 81, .5], [5, 78, .25], [5.5, 76, .5], [6, 74, 1.5]] as const;
const THEME = [[0, 74, .5], [.5, 76, .5], [1, 79, .5], [1.5, 76, .5], [2, 74, 1], [3, 71, 1]] as const;
const SCALE = [7, 9, 11, 0, 2, 4, 6];
const third = (midi: number) => { const i = SCALE.indexOf(midi % 12); return midi - ((midi % 12 - SCALE[(i + 5) % 7] + 12) % 12); };

const lastBar = (bars: Progression, chord: Chord): Progression => bars.map(([beat, c], i) => [beat, i === bars.length - 1 ? chord : c] as const);

export function composeHighlife(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const drop = at(flow.reveal, 1), shut = flow.coverShut, shutBeat = beatAt(shut);
  const home = drop + 4 * Math.round((beatAt(issues.native) - drop) / 4), logo = at(end.logo, 1);
  const sixteenths = (from: number, to: number, play: (beat: number, s: number, t: number) => void) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++)
      play(step / 4, ((step - drop * 4) % 16 + 16) % 16, g(step / 4) + (mix.random() - .5) * .006);
  };

  const wood = (time: number, notes: readonly number[], step: number, velocity: number, pan = 0) =>
    notes.forEach((midi, i) => balafon(mix, time + i * step, midi, velocity, {...WOOD, pan: pan - .3 + .6 * i / Math.max(1, notes.length - 1)}));
  const lick = (time: number, notes: readonly number[], step: number, velocity: number, pan = .3) =>
    notes.forEach((midi, i) => guitar(mix, time + i * step, midi, velocity, {...LINE_GTR, pan: pan + (i % 2 ? .08 : -.08)}, {length: step * 2 + .4, bright: .7}));
  const theme = (beat: number, velocity: number, shift = 0) =>
    THEME.forEach(([b, midi, length]) => guitar(mix, g(beat + b), midi + shift, velocity, {...LINE_GTR, pan: .2}, {length: length * .5 + .3, bright: .7}));
  const riff = (beat: number, velocity: number, notes: readonly (readonly [number, number, number])[] = RIFF) =>
    notes.forEach(([b, midi, length]) => brass(mix, g(beat + b), [midi, third(midi)], length * .5, velocity, HORNS, {bright: .55, attack: .02}));

  /** The two guitars: `line` adds the high single-note part over the offbeat chanks. */
  const guitars = (bars: Progression, from: number, to: number, line: boolean, level = 1) => sixteenths(from, to, (beat, s, t) => {
    const [, chord] = chordAt(bars, beat), degrees = [...chord.tones.map(n => n + 12), chord.tones[0] + 24, chord.tones[1] + 24];
    if (s % 4 === 2) strum(mix, t, chord.tones.map(n => n + 12), .17 * level, CHANK, {length: .1, mute: .6, bright: .55, spread: .005, up: s % 8 === 6});
    const note = line ? LINE.find(([step]) => step === s) : undefined;
    if (note) guitar(mix, t, degrees[note[1]], (s % 4 === 0 ? .2 : .15) * level, {...LINE_GTR, pan: .38 + (s % 2 ? .06 : -.06)}, {length: .28, mute: .25, bright: .75});
  });
  const bassline = (bars: Progression, from: number, to: number, full: boolean) => sixteenths(from, to, (beat, s, t) => {
    const hit = SKIP.find(([step]) => step === s);
    if (!hit || (!full && s % 8 !== 0 && s !== 6)) return;
    const [, chord] = chordAt(bars, beat), root = chord.bass - 12 < 28 ? chord.bass : chord.bass - 12;
    synthBass(mix, t, root + hit[1], hit[2], s % 8 === 0 ? .46 : .36, LOW, {bright: .28});
  });
  /** Hands and bell always; `full` adds the kick, a soft backbeat and 16th shaker. */
  const drums = (from: number, to: number, full: boolean, level = 1) => sixteenths(from, to, (_, s, t) => {
    const bellHit = BELL.find(([step]) => step === s);
    if (bellHit) bell(mix, t, bellHit[1], (bellHit[1] > 88 ? .09 : .07) * level, {...HANDS, pan: .45}, {decay: .1, ratio: 1.5, index: 2.2});
    if (s === 4 || s === 12) conga(mix, t, 262, .14 * level, {...HANDS, pan: -.25}, {slap: 1});
    if (s === 6 || s === 7) conga(mix, t, 262, (s === 7 ? .22 : .16) * level, {...HANDS, pan: -.25});
    if (s === 14 || s === 15) conga(mix, t, 196, (s === 15 ? .24 : .18) * level, {...HANDS, pan: -.4});
    if (full && (s === 0 || s === 8)) conga(mix, t, 240, .1 * level, {...HANDS, pan: -.3}, {mute: 1});
    if (!full) { if (s % 4 === 2) shaker(mix, t, .1 * level, {...HANDS, pan: .3}); return; }
    shaker(mix, t, (s % 4 === 2 ? .13 : s % 2 ? .06 : .08) * level, {...HANDS, pan: .3});
    if (s === 0 || s === 8 || s === 10) kick(mix, t, (s === 10 ? .22 : .3) * level, DRUM);
    if (s === 4 || s === 12) { snare(mix, t, .14 * level, {...KIT, pan: -.05}, .85); clap(mix, t + .005, .1 * level, {...KIT, hall: .12}); }
  });

  // ── You build agents: a strummed G ringing out, the balafon rolling up over it.
  strum(mix, u2.agentEnter + .05, [43, 55, 59, 62, 67, 71], .26, {...LINE_GTR, pan: 0}, {length: 3.4, bright: .6, spread: .03});
  wood(u2.agentEnter + .7, [79, 83, 86, 91], .09, .2, .2);

  // ── From the first trace: bell, hands and chanks; the high line joins on the insights; the last bar is D.
  const from = at(u2.stream.at), insights = at(u2.insights, 1), depletion = at(cost.depletion.at);
  const easy = lastBar(loopBars(from, drop, EASY, drop), D);
  guitars(easy, Math.ceil(from), insights, false);
  guitars(easy, insights, depletion, true);
  bassline(easy, Math.ceil(from), depletion, false);
  drums(Math.ceil(from), depletion, false);

  // ── When your agent fails: the guitar falls; the upward turn climbs; the backtrack is the balafon rewinding.
  lick(u2.failure, [83, 79, 76, 74], .14, .26);
  lick(u2.upwardTurn.at + .1, [67, 71, 74], u2.upwardTurn.duration / 3, .22, -.1);
  wood(u2.backtrack.at, [95, 91, 88, 86, 83, 79, 76, 74], .05, .16);
  u2.drawers.forEach((time, i) => balafon(mix, time, [79, 83, 86][i], .22 + i * .03, {...WOOD, pan: -.2 + i * .2}));
  wood(u2.highlight.at, [91], 0, .2, .25);

  // ── The insights: the guitar's line; the zoom is the balafon climbing; "if only" leaves an A hanging.
  theme(insights + 1, .26);
  wood(u2.zoom.at + .4, [67, 69, 71, 74, 76, 79, 81, 83, 86], (u2.zoom.duration - .4) / 9, .13);
  wood(u2.ifOnly + .1, [93], 0, .22, .3);

  // ── Cheap LLMs: a guitar flick per pass; the miss droops. Powerful LLMs: a low horn hit on the bash window.
  cost.cheapLegs.forEach(leg => lick(leg.at, leg.direction === 'leftToRight' ? [79, 81, 83, 86] : [86, 83, 81, 79], leg.duration / 4, .18, leg.direction === 'leftToRight' ? -.3 : .3));
  lick(cost.missIssues + .1, [81, 76], .25, .22, 0);
  brass(mix, cost.bashStop, [50, 57], .45, .28, HORNS, {bright: .35});
  wood(cost.budgetAppear, [86], 0, .2, -.1);

  // ── …but the costs are unsustainable: guitars and bell only, the line sinking;
  // until now, the hands come back in a two-bar roll and the horns swell on D.
  [[0, 86], [1, 83], [2, 79], [3, 76]].forEach(([b, midi]) => guitar(mix, g(depletion + b), midi, .24, {...LINE_GTR, pan: .2}, {length: 1, bright: .65}));
  guitars(easy, depletion, drop, false, .9);
  sixteenths(depletion, drop - 2, (_, s, t) => { const hit = BELL.find(([step]) => step === s); if (hit) bell(mix, t, hit[1], .07, {...HANDS, pan: .45}, {decay: .1, ratio: 1.5, index: 2.2}); });
  sixteenths(drop - 2, drop, (beat, s, t) => conga(mix, t, s % 2 ? 196 : 262, .06 + .14 * (beat - drop + 2) / 2, {...HANDS, pan: s % 2 ? -.4 : -.2}, {slap: s % 4 === 0 ? .6 : 0}));
  brass(mix, g(drop - 2), [57, 62, 66, 69], .95, .26, HORNS, {bright: .5, attack: .7});

  // ── Introducing Flow-1: the full band — kick and backbeat, both guitars, the skipping bass and the horn riff.
  const shine = loopBars(drop, shutBeat, SHINE, drop);
  strum(mix, flow.reveal, [48, 55, 60, 64, 67, 72], .28, {...LINE_GTR, pan: 0}, {length: 1.6, bright: .7, spread: .012});
  guitars(shine, drop, shutBeat, true);
  bassline(shine, drop, shutBeat, true);
  drums(drop, shutBeat, true);
  riff(drop, .36);
  // Matching Sonnet-5 at 2% of the cost: the balafon on the zoom; bead landings climb, flow-1's (the third) with a horn stab.
  wood(flow.cameraZoom.at, [83, 86], .12, .2);
  if (flow.animation21) {
    flow.numberDrops.forEach((time, i) => balafon(mix, time, [79, 81, 83, 86, 88, 91][i], i === 2 ? .26 : .18, {...WOOD, pan: -.3 + i * .12}));
    brass(mix, flow.numberDrops[2], [83, 79], .25, .32, HORNS);
  } else brass(mix, flow.numberSwap.at, [83, 79], .25, .34, HORNS);
  wood(flow.barsGrow.at, [74, 76, 79, 81, 83, 86, 88, 91, 93], flow.barsGrow.duration / 9, .18);
  // Flow-1 powers Signals: the guitar's line climbs; the door shuts on a horn chord.
  theme(at(flow.cameraToEngine.at, 1), .28, 5);
  brass(mix, shut, [60, 64, 67, 71], .55, .3, HORNS);

  // ── Our agent, built to analyze traces at scale: behind the door, hands, bell and both guitars, no kick.
  const door = lastBar(loopBars(Math.ceil(shutBeat + .5), home, DOOR, home), D), p = issues.prelude;
  guitars(door, door[0][0], home, true, .9);
  bassline(door, door[0][0], home, false);
  drums(door[0][0], home - 1, false, 1.1);
  sixteenths(home - 1, home, (beat, s, t) => conga(mix, t, s % 2 ? 196 : 262, .1 + .12 * (beat - home + 1), {...HANDS, pan: s % 2 ? -.4 : -.2}));
  brass(mix, p.bashStop, [52, 59], .4, .24, HORNS, {bright: .35});
  wood(p.descent.at, [95, 91, 88, 86, 83, 79, 76, 74], p.descent.duration / 8, .15);
  balafon(mix, p.highlight, 88, .24, {...WOOD, pan: .2});
  // "At scale": the balafon climbs with the zoom out; the line grows with the circle; the scale-out is the pickup home.
  wood(p.zoomOut.at, [67, 69, 71, 74, 76, 79, 81, 83, 86, 88], p.zoomOut.duration / 10, .13);
  theme(at(p.circleGrow.at, 1), .26);
  lick(p.scaleOut, [71, 74, 76, 79, 83], .07, .2, -.2);

  // ── It finds deep issues, in every trace: the full band again; the last bar is D.
  const homeBars = lastBar(loopBars(home, logo, SHINE, logo), D);
  guitars(homeBars, home, logo, true);
  bassline(homeBars, home, logo, true);
  drums(home, logo - 1, true);
  if (issues.postludeActive) {
    // Issue triangles land on the balafon, falling down the pentatonic.
    cascade(issues.pops, [74, 76, 79, 81, 83, 86, 88, 91, 93]).forEach((note, i) => balafon(mix, note.time, note.midi, .22 - i * .008, {...WOOD, pan: note.pan * .85}));
    // …and clusters them into patterns: a horn stab under the lock; ready for you, the guitar settles.
    const [, locked] = chordAt(homeBars, beatAt(issues.clusters[0]));
    brass(mix, issues.clusters[0], locked.tones.map(t => t + 12), .35, .3, HORNS);
    const ready = at(issues.ready, 1);
    [[0, 76, 1.5], [1.5, 74, .5], [2, 71, 2]].forEach(([b, midi, length]) => guitar(mix, g(ready + b), midi, .24, {...LINE_GTR, pan: .2}, {length: length * .5 + .4, bright: .7}));
  }

  // ── Unlock the insights: the horn riff's first bar, a conga roll into the logo.
  riff(at(end.start, 1) + .5, .32, RIFF.slice(0, 7));
  for (let n = 0; n < 4; n++) conga(mix, g(logo - 1 + n * .25), n % 2 ? 196 : 262, .12 + n * .04, {...HANDS, pan: n % 2 ? -.4 : -.2}, {slap: n === 3 ? .7 : 0});

  // ── With Laminar: G major — a kick and the bass, the horns and a strum swelling in under the name; the balafon answers after it.
  kick(mix, end.logo, .32, DRUM);
  synthBass(mix, end.logo, 31, 1.6, .5, LOW, {bright: .25});
  brass(mix, end.logo, [67, 71, 74, 79], 1.2, .24, HORNS, {bright: .4, attack: .35});
  strum(mix, end.logo + .02, [55, 59, 62, 67, 71, 74, 79], .2, {...LINE_GTR, pan: 0}, {length: 3, bright: .55, spread: .02});
  bell(mix, end.logo + .9, 91, .08, {...HANDS, pan: .45}, {decay: .12, ratio: 1.5, index: 2.2});
  wood(end.logo + 1, [83, 86, 91, 95], .16, .16);
}
