import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {hat, kick, piano, shaker, snare, clap, type Mix, type Route} from '../voices';
import {cascade, chordAt, loopBars, melody, rolled, type Chord, type Progression} from '../writing';
import {brass, guitar, strum, synthBass} from './instruments';

/*
 * "City pop, light" — D major, then up a whole step to E at Flow-1. Glossy DX electric piano, a clean
 * guitar, a soft synth bass. Before Flow-1 it is one easy IV – iii – ii – V loop with a shaker and offbeat
 * guitar chanks; the picture is answered by guitar licks and electric-piano chimes. The last bar leans on
 * B13sus, the new key's dominant, and Flow-1 lands in E with the full kit, 16th funk guitar and a brass-synth
 * hook. The logo is the hook's last stab on E major 9.
 */

const EP: Route = {bus: 'music', hall: .22, room: .06, delay: .08};
const CHIME: Route = {bus: 'music', hall: .3, delay: .26};
const GTR: Route = {bus: 'music', hall: .14, room: .12, delay: .1};
const HORNS: Route = {bus: 'music', hall: .22, room: .08};
const KIT: Route = {bus: 'music', room: .12};
const LOW: Route = {bus: 'music', gain: .9};

// Rootless voicings; the bass plays the root.
const Gmaj9: Chord = {bass: 43, tones: [59, 62, 66, 69]}, Fsm11: Chord = {bass: 42, tones: [57, 61, 64, 71]};
const Em9: Chord = {bass: 40, tones: [55, 59, 62, 66]}, A13: Chord = {bass: 45, tones: [55, 61, 66, 71]};
const B13sus: Chord = {bass: 47, tones: [57, 61, 64, 68]}, Emaj9: Chord = {bass: 40, tones: [56, 59, 63, 66]};
const Csm9: Chord = {bass: 37, tones: [52, 56, 59, 63]}, Amaj9: Chord = {bass: 45, tones: [56, 59, 61, 64]};
const Gsm7: Chord = {bass: 44, tones: [54, 59, 63, 66]}, Fsm9: Chord = {bass: 42, tones: [52, 56, 57, 61]};
const EASY = [Gmaj9, Fsm11, Em9, A13], SHINE = [Emaj9, Csm9, Amaj9, B13sus], DOOR = [Amaj9, Gsm7, Fsm9, B13sus], HOME = [Emaj9, Csm9, Amaj9, Fsm9, B13sus];
/** The guitar's line in D: F♯ – A – B – A – D – C♯ – A. */
const THEME = [[0, 78, .5], [.5, 81, .5], [1, 83, 1], [2, 81, .5], [2.5, 86, 1], [3.5, 85, .5], [4, 81, 2]] as const;
/** The brass hook in E, two bars of syncopated stabs. */
const HOOK = [[0, 71, .4], [.5, 73, .4], [1, 76, 1.2], [2.5, 75, .4], [3, 76, .4], [3.5, 78, 1.4], [5.5, 80, .4], [6, 78, .4], [6.5, 76, 1.4]] as const;
/** 16th funk chops per beat-pair: 1 is an open stab, .6 a half-muted one, .35 a ghosted chk, 0 a rest. */
const CHOPS = [1, 0, .35, .6, 0, .35, 1, .35, .6, 0, .35, 1, 0, .35, .6, .35];

export function composeCityPop(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const drop = at(flow.reveal, 1), shut = flow.coverShut, shutBeat = beatAt(shut);
  const home = drop + 4 * Math.round((beatAt(issues.native) - drop) / 4), logo = at(end.logo, 1);
  const lick = (time: number, notes: readonly number[], step: number, velocity: number, pan = .15) =>
    notes.forEach((midi, i) => guitar(mix, time + i * step, midi, velocity, {...GTR, pan: pan + (i % 2 ? .08 : -.08)}, {length: step * 2 + .6, bright: .6}));
  const chime = (time: number, notes: readonly number[], step: number, velocity: number, pan = 0) =>
    notes.forEach((midi, i) => piano(mix, time + i * step, midi, velocity, {...CHIME, pan: pan - .3 + .6 * i / Math.max(1, notes.length - 1)}, {length: 1.2, bright: .6}));
  const theme = (beat: number, velocity: number, shift = 0) =>
    THEME.forEach(([b, midi, length]) => guitar(mix, g(beat + b), midi + shift, velocity, {...GTR, pan: .2}, {length: length * .5 + .4, bright: .65}));
  const hook = (beat: number, velocity: number, octave = 0) =>
    HOOK.forEach(([b, midi, length]) => brass(mix, g(beat + b), [midi + octave, midi + octave - 12], length * .5, velocity, HORNS, {bright: .6}));

  /** The electric piano: pre-Flow a chord and a soft push per bar; after it, a stab on one and the and of two. */
  const keys = (bars: Progression, to: number, full: boolean, velocity: number) => bars.forEach(([beat, chord], i) => {
    const next = Math.min(to, i + 1 < bars.length ? bars[i + 1][0] : to);
    if (beat >= to) return;
    rolled(mix, g(beat) + .006, chord.tones, velocity, EP, {length: full ? .9 : g(next) - g(beat), bright: .55, spread: .008});
    if (next - beat >= 3) rolled(mix, g(beat + (full ? 1.5 : 2.5)), chord.tones.slice(1), velocity * .6, EP, {length: full ? .5 : 1.1, bright: .5, spread: .006});
  });
  /** The synth bass: pre-Flow a root and a soft octave pop; after it, octaves bouncing on the eighths. */
  const bassline = (bars: Progression, to: number, full: boolean) => bars.forEach(([beat, chord], i) => {
    const next = i + 1 < bars.length ? bars[i + 1] : undefined, stop = Math.min(to, next?.[0] ?? to);
    const root = chord.bass - 12 < 28 ? chord.bass : chord.bass - 12;
    if (beat >= to) return;
    const notes = full ? [[0, 0, .35, .55], [.75, 12, .15, .35], [1.5, 0, .3, .45], [2, 12, .15, .4], [2.5, 7, .3, .42], [3.5, 11, .2, .3]] : [[0, 0, 1.2, .45], [2.5, 12, .3, .3]];
    for (const [offset, interval, length, velocity] of notes) if (beat + offset < stop - 1e-9) synthBass(mix, g(beat + offset), root + interval, length, velocity, LOW, {bright: full ? .5 : .3});
  });
  /** Guitar: pre-Flow two soft chanks on the backbeats; after it, 16th funk chops through the voicing. */
  const rhythm = (bars: Progression, from: number, to: number, full: boolean) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const beat = step / 4, [, chord] = chordAt(bars, beat), s = ((step - drop * 4) % 16 + 16) % 16, top = chord.tones.slice(1).map(t => t + 12);
      if (!full) { if (s === 4 || s === 12) strum(mix, g(beat), top, .22, {...GTR, pan: -.3}, {length: .09, mute: .55, bright: .5, spread: .006}); continue; }
      const accent = CHOPS[s];
      if (accent) strum(mix, g(beat) + (s % 2 ? .012 : 0), top, .16 + .16 * accent, {...GTR, pan: -.35}, {length: accent === 1 ? .16 : .05, mute: accent === 1 ? .3 : .85, bright: .6, spread: .004, up: s % 2 === 1});
    }
  };
  /** The kit, bar lines on the drop: pre-Flow a shaker and a soft kick; after it, kick, snare-and-clap backbeat and 16th hats. */
  const kit = (from: number, to: number, full: boolean, level = 1) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const t = g(step / 4) + (mix.random() - .5) * .004, s = ((step - drop * 4) % 16 + 16) % 16;
      if (!full) {
        if (s % 2 === 0) shaker(mix, t, (s % 4 ? .1 : .16) * level, {...KIT, pan: .3});
        if (s === 0 || s === 10) kick(mix, t, .16 * level, KIT);
        continue;
      }
      if (s === 0 || s === 6 || s === 10) kick(mix, t, (s ? .28 : .34) * level, KIT);
      if (s === 4 || s === 12) { snare(mix, t, .26 * level, {...KIT, pan: -.05}, .75); clap(mix, t + .004, .16 * level, {...KIT, hall: .1}); }
      hat(mix, t, (s % 4 === 2 ? .2 : s % 2 ? .08 : .13) * level, {...KIT, pan: .25}, s === 14 ? .05 : .016);
    }
  };

  // ── You build agents: D major 9 on the electric piano, a guitar harmonic ringing over it.
  rolled(mix, u2.agentEnter + .05, [38, 54, 57, 61, 64, 66], .3, EP, {length: 4, bright: .5, spread: .06});
  guitar(mix, u2.agentEnter + .7, 86, .26, {...GTR, pan: .3}, {length: 2.4, bright: .8});

  // ── One loop from the first trace to Flow-1, its last bar on B13sus: the pivot into E.
  const from = at(u2.stream.at), easy = loopBars(from, drop, EASY, drop).map(([b, chord], i, all) => [b, i === all.length - 1 ? B13sus : chord] as const);
  keys(easy, drop, false, .26);
  bassline(easy, drop, false);
  rhythm(easy, Math.ceil(from), drop, false);
  kit(Math.ceil(from), drop - 1, false);

  // ── When your agent fails: the guitar falls; the upward turn climbs, the backtrack is a chime rewinding.
  lick(u2.failure, [81, 78, 76, 74], .15, .3);
  lick(u2.upwardTurn.at + .1, [69, 71, 74], u2.upwardTurn.duration / 3, .24, -.1);
  chime(u2.backtrack.at, [93, 90, 88, 86, 83, 81, 78, 76], .05, .18);
  u2.drawers.forEach((time, i) => guitar(mix, time, [74, 78, 81][i], .28 + i * .03, {...GTR, pan: -.2 + i * .2}, {length: 1.4, bright: .7}));
  chime(u2.highlight.at, [86], 0, .2, .25);

  // ── The insights are hidden across thousands of traces: the guitar's line; the zoom is a chime drifting up.
  theme(at(u2.insights, 1) + 1, .3);
  chime(u2.zoom.at + .4, [69, 71, 74, 76, 78, 81, 83, 86, 88], (u2.zoom.duration - .4) / 9, .12);
  // If only someone could read them all: an E, the ninth, left hanging.
  chime(u2.ifOnly + .1, [88], 0, .24, .3);

  // ── Cheap LLMs: a quick guitar flick per pass; the miss droops a third.
  cost.cheapLegs.forEach(leg => lick(leg.at, leg.direction === 'leftToRight' ? [81, 83, 86, 88] : [88, 86, 83, 81], leg.duration / 4, .2, leg.direction === 'leftToRight' ? -.3 : .3));
  lick(cost.missIssues + .1, [83, 78], .25, .24, 0);
  // Powerful LLMs: a low synth-brass hit as the bash window lands.
  brass(mix, cost.bashStop, [50, 57], .5, .3, HORNS, {bright: .35});
  chime(cost.budgetAppear, [86], 0, .2, -.1);

  // ── …but the costs are unsustainable: the guitar's line sinks; until now, the brass swells on B13sus into E.
  const depletion = at(cost.depletion.at);
  [[0, 86], [1, 83], [2, 81], [3, 78]].forEach(([b, midi]) => guitar(mix, g(depletion + b), midi, .26, {...GTR, pan: .2}, {length: 1.2, bright: .6}));
  brass(mix, g(drop - 2), [59, 64, 68, 71], 1, .3, HORNS, {bright: .5, attack: .8});

  // ── Introducing Flow-1: up a whole step to E — the full kit, funk guitar, bouncing bass and the brass hook.
  const shine = loopBars(drop, shutBeat, SHINE, drop);
  rolled(mix, flow.reveal - .2, [28, 40, 56, 59, 63, 66, 71], .4, EP, {length: 3, bright: .6, spread: .01});
  keys(shine, shutBeat, true, .28);
  bassline(shine, shutBeat, true);
  rhythm(shine, drop, shutBeat, true);
  kit(drop, shutBeat, true);
  hook(drop, .42);
  theme(drop + 9, .3, 2);
  // Matching Sonnet-5 at 2% of the cost: a brass stab on the swap, a chime glissando as the bars (Animation 21: the graph) grow.
  chime(flow.cameraZoom.at, [83, 88], .12, .2);
  // Animation 21 has no number swap: chimes climb with the six bead landings and the brass stabs on flow-1's (the third).
  if (flow.animation21) {
    flow.numberDrops.forEach((time, i) => piano(mix, time, [80, 83, 85, 88, 90, 92][i], .18, {...CHIME, pan: -.3 + i * .12}, {length: 1, bright: .6}));
    brass(mix, flow.numberDrops[2], [83, 88], .25, .34, HORNS);
  } else brass(mix, flow.numberSwap.at, [83, 88], .25, .36, HORNS);
  chime(flow.barsGrow.at, [76, 78, 80, 83, 85, 88, 90, 92, 95], flow.barsGrow.duration / 9, .2);
  // Flow-1 powers Signals: the guitar climbs; the door closes on a brass chord.
  const engine = at(flow.cameraToEngine.at, 1);
  [[0, 76], [1, 78], [2, 80], [2.5, 83]].forEach(([b, midi]) => guitar(mix, g(engine + b), midi, .3, {...GTR, pan: .2}, {length: 1, bright: .7}));
  brass(mix, shut, [57, 61, 64, 68], .6, .34, HORNS);

  // ── Our agent, built to analyze traces at scale: behind the door, the easy groove in E — shaker, chanks, keys.
  const door = loopBars(Math.ceil(shutBeat + .5), home, DOOR, home), p = issues.prelude;
  keys(door, home, false, .26);
  bassline(door, home, false);
  rhythm(door, door[0][0], home, false);
  kit(door[0][0], home - 1, false, 1.2);
  brass(mix, p.bashStop, [52, 59], .4, .26, HORNS, {bright: .35});
  chime(p.descent.at, [95, 92, 90, 88, 85, 83, 80, 78], p.descent.duration / 8, .15);
  guitar(mix, p.highlight, 88, .26, {...GTR, pan: .2}, {length: 1.4, bright: .7});
  // "At scale": the zoom out climbs; the guitar's line grows with the circle; the scale-out is the pickup home.
  chime(p.zoomOut.at, [68, 71, 73, 76, 78, 80, 83, 85, 88, 90], p.zoomOut.duration / 10, .13);
  theme(at(p.circleGrow.at, 1), .28, 2);
  lick(p.scaleOut, [71, 73, 76, 80, 83], .07, .2, -.2);

  // ── It finds deep issues, in every trace: the full groove again.
  const homeBars = loopBars(home, logo, HOME, logo);
  keys(homeBars, logo, true, .26);
  bassline(homeBars, logo, true);
  rhythm(homeBars, home, logo, true);
  kit(home, logo - 1, true);
  if (issues.postludeActive) {
    // Issue triangles land as chimes, falling down the pentatonic.
    cascade(issues.pops, [76, 78, 80, 83, 85, 88, 90, 92, 95]).forEach((note, i) => piano(mix, note.time, note.midi, .22 - i * .01, {...CHIME, pan: note.pan * .85}, {length: 1, bright: .6}));
    // …and clusters them into patterns: a brass stab under the lock; ready for you, the guitar settles.
    const [, locked] = chordAt(homeBars, beatAt(issues.clusters[0]));
    brass(mix, issues.clusters[0], locked.tones.map(t => t + 12), .35, .34, HORNS);
    const ready = at(issues.ready, 1);
    melody(mix, g, [[ready, 76, 1.5], [ready + 1.5, 75, .5], [ready + 2, 71, 2]], {...CHIME, pan: .2}, {velocity: .26, bright: .6});
  }

  // ── Unlock the insights: IV → V under the brass hook an octave up, a snare fill into the logo.
  hook(at(end.start, 1) + .5, .36, 12);
  for (let n = 0; n < 4; n++) snare(mix, g(logo - 1 + n * .25), .14 + n * .06, {...KIT, pan: -.2 + n * .12}, .8);

  // ── With Laminar: the hook's last stab on E major 9 — brass, keys, a guitar strum and the bass under it.
  synthBass(mix, end.logo, 28, 1.6, .5, LOW, {bright: .3});
  kick(mix, end.logo, .34, KIT);
  brass(mix, end.logo, [68, 71, 75, 78], .9, .4, HORNS);
  rolled(mix, end.logo, [40, 52, 56, 59, 63, 66, 71, 75], .36, EP, {length: end.end - end.logo, bright: .6, spread: .02});
  strum(mix, end.logo + .02, [64, 68, 71, 75, 78], .3, {...GTR, pan: .2}, {length: 2.4, bright: .7, spread: .012});
  chime(end.logo + .8, [87, 90, 92, 95], .3, .18);
}
