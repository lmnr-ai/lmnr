import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bass, bell, clap, hat, kick, pad, tick, type Mix, type Pump, type Route} from '../voices';
import {cascade, chordAt, loopBars, type Chord, type Progression} from '../writing';

/*
 * "Minimal techno, glassy" — F♯ minor into A major. A clean click-track of 16th ticks, a soft sub, a thin
 * glass pad and FM bells cycling every three 16ths against the bar. Before Flow-1 it is one steady loop with
 * the kick on the half notes; every UI moment is a bell ping snapped onto the 16th grid. Flow-1 brings the
 * four-on-the-floor, offbeat hats, a pumping rolling sub and a bell motif that climbs a step each bar.
 * Behind the Signals door the kick drops out; the logo is an A major 9 bell chord over the sub.
 */

const GLASS: Route = {bus: 'music', gain: 1.5, hall: .26, delay: .3};
const PING: Route = {bus: 'music', gain: 1.7, hall: .3, delay: .36};
const PAD: Route = {bus: 'music', hall: .4};
const KIT: Route = {bus: 'music', room: .08};
const SUB: Route = {bus: 'music', gain: .7};

const Fsm9: Chord = {bass: 42, tones: [57, 61, 64, 68]}, Dmaj9: Chord = {bass: 38, tones: [54, 57, 61, 64]};
const E6: Chord = {bass: 40, tones: [56, 59, 61, 64]}, Amaj9: Chord = {bass: 45, tones: [59, 61, 64, 68]};
const Bm9: Chord = {bass: 47, tones: [57, 61, 62, 66]};
const STILL = [Fsm9, Fsm9, Dmaj9, E6], LIFT = [Amaj9, Fsm9, Dmaj9, E6], DOOR = [Dmaj9, Bm9, Fsm9, E6], HOME = [Amaj9, Fsm9, Dmaj9, Bm9, E6];
/** The rising motif: four chord tones up, each bar starting one tone higher. */
const MOTIF = [0, 1, 2, 3];

export function composeTechno(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  /** Every UI moment lands on the nearest 16th. */
  const q = (time: number) => g(Math.round(beatAt(time) * 4) / 4);
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const drop = at(flow.reveal, 1), shut = flow.coverShut, shutBeat = beatAt(shut);
  const home = drop + 4 * Math.round((beatAt(issues.native) - drop) / 4), logo = at(end.logo, 1);
  const pump: Pump = {origin: g(drop), period: .5, depth: .45};
  const ping = (time: number, midi: number, velocity: number, pan = 0, decay = .9) => bell(mix, q(time), midi, velocity, {...PING, pan}, {decay, ratio: 3.5, index: 1.3});
  /** A run of bell pings, one 16th apart from the snapped start. */
  const run = (time: number, notes: readonly number[], velocity: number, pan = 0, every = 1) =>
    notes.forEach((midi, i) => bell(mix, q(time) + i * every * .125, midi, velocity, {...PING, pan: pan - .3 + .6 * i / Math.max(1, notes.length - 1)}, {decay: .6, ratio: 3.5, index: 1.2}));

  /** The glass pad, one chord per bar; after Flow-1 it pumps with the kick. */
  const pads = (bars: Progression, to: number, level: number, pumped = false) => bars.forEach(([beat, chord], i) => {
    const next = Math.min(to, i + 1 < bars.length ? bars[i + 1][0] : to);
    if (beat < to) pad(mix, g(beat), g(next) + .05, chord.tones, PAD, {attack: .4, release: .8, cutoff: [700, 1600], level, pump: pumped ? pump : undefined});
  });
  /** The sub: pre-Flow a held root per bar; after it, rolling on the offbeat eighths. */
  const sub = (bars: Progression, to: number, rolling: boolean, velocity = .5) => bars.forEach(([beat, chord], i) => {
    const next = Math.min(to, i + 1 < bars.length ? bars[i + 1][0] : to), root = chord.bass - 12 < 30 ? chord.bass : chord.bass - 12;
    if (beat >= to) return;
    if (!rolling) return bass(mix, g(beat), root, g(next) - g(beat) - .1, velocity, SUB, {drive: 1.1});
    for (let b = beat; b < next - 1e-9; b += 1) bass(mix, g(b + .5), root + (b - beat === 3 ? 7 : 0), .2, velocity, SUB, {drive: 1.6});
  });
  /** Glass bells cycling the chord every three 16ths, so the figure turns against the bar. */
  const glass = (bars: Progression, from: number, to: number, velocity: number, octave = 12) => {
    for (let step = Math.ceil(from * 4 - 1e-9), k = 0; step < to * 4 - 1e-9; step++) {
      if (((step - drop * 4) % 3 + 3) % 3) continue;
      const [, chord] = chordAt(bars, step / 4), midi = chord.tones[k++ % chord.tones.length] + octave;
      bell(mix, g(step / 4), midi, velocity * (k % 4 === 1 ? 1 : .7), {...GLASS, pan: k % 2 ? .35 : -.35}, {decay: .45, ratio: 3.5, index: 1});
    }
  };
  /** The click-track: 16th ticks with a kick on the half notes (`half`) or every beat, offbeat hats and a soft clap on two and four. */
  const grid = (from: number, to: number, {four = false, level = 1} = {}) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const t = g(step / 4), s = ((step - drop * 4) % 16 + 16) % 16;
      tick(mix, t, 100, (s % 4 === 0 ? .5 : s % 2 ? .22 : .34) * level, {...KIT, pan: s % 2 ? .3 : -.1}, .004);
      if (s % (four ? 4 : 8) === 0) kick(mix, t, (four ? .34 : .2) * level, KIT);
      if (four && s % 4 === 2) hat(mix, t, .4 * level, {...KIT, pan: .2}, .04);
      if (four && (s === 4 || s === 12)) clap(mix, t, .32 * level, {...KIT, hall: .12});
    }
  };

  // ── You build agents: an F♯ minor 9 bell chord shimmers in, the pad under it.
  [42, 57, 61, 64, 68, 73].forEach((midi, i) => bell(mix, u2.agentEnter + .05 + i * .125, midi + (i ? 12 : 24), .22 - i * .02, {...GLASS, pan: -.3 + i * .12}, {decay: 1.6, ratio: 3.5, index: 1}));

  // ── One steady loop from the first trace to Flow-1: ticks, a soft half-time kick, the sub, the glass.
  const from = at(u2.stream.at), still = loopBars(from, drop, STILL, drop);
  pads(loopBars(g(0) > u2.agentEnter ? beatAt(u2.agentEnter + .3) : from, drop, STILL, drop), drop, .6);
  sub(still, drop, false, .34);
  glass(still, from, drop, .16);
  grid(Math.ceil(from), drop - 1);

  // ── When your agent fails: three pings fall; the upward turn climbs, the backtrack rewinds on 16ths.
  run(u2.failure, [85, 81, 76], .26, .1);
  run(u2.upwardTurn.at, [69, 73, 76], .2, -.1, 2);
  run(u2.backtrack.at, [92, 88, 85, 80, 76], .18, .3);
  u2.drawers.forEach((time, i) => ping(time, [76, 80, 85][i], .24 + i * .03, -.2 + i * .2));
  ping(u2.highlight.at, 88, .2, .25);

  // ── The insights are hidden across thousands of traces: a slow bell phrase; the zoom climbs in eighths.
  const insights = at(u2.insights, 1) + 1;
  [[0, 81], [1, 85], [2, 88], [3.5, 85], [4, 80]].forEach(([b, midi]) => bell(mix, g(insights + b), midi, .24, {...PING, pan: .2}, {decay: 1.4, ratio: 3.5, index: 1.2}));
  run(u2.zoom.at + .4, [73, 76, 80, 81, 85, 88, 92, 93], .13, 0, Math.max(1, Math.round((u2.zoom.duration - .4) / 8 / .125)));
  // If only someone could read them all: a G♯, the ninth, left hanging in the echo.
  ping(u2.ifOnly, 80, .26, .3, 2.4);

  // ── Cheap LLMs: a quick four-ping flick per pass; the miss droops.
  cost.cheapLegs.forEach(leg => run(leg.at, leg.direction === 'leftToRight' ? [85, 88, 92, 93] : [93, 92, 88, 85], .15, leg.direction === 'leftToRight' ? -.3 : .3));
  run(cost.missIssues + .1, [81, 76], .22, 0, 2);
  // Powerful LLMs: the bash window lands with a deep sub and a low bell.
  bass(mix, q(cost.bashStop), 30, 1.4, .5, SUB, {drive: 1.3});
  ping(cost.bashStop, 54, .3, -.2, 1.6);
  ping(cost.budgetAppear, 88, .2, -.1);

  // ── …but the costs are unsustainable: the bells sink and slow; until now, a 16th climb into the drop.
  const depletion = at(cost.depletion.at);
  [[0, 88], [1, 85], [2, 81], [3, 76], [4.5, 73]].forEach(([b, midi], i) => bell(mix, g(depletion + b), midi, .22 - i * .02, {...PING, pan: .2}, {decay: 1.2, ratio: 3.5, index: 1.1}));
  run(g(drop - 1), [69, 73, 76, 80, 81, 85, 88, 92], .12, 0, .5);

  // ── Introducing Flow-1: A major and the four-on-the-floor; the pad pumps; the motif climbs a step each bar.
  const lift = loopBars(drop, shutBeat, LIFT, drop);
  bass(mix, flow.reveal - .2, 33, 1.2, .55, SUB, {drive: 1.3});
  [57, 61, 64, 68, 71, 76].forEach((midi, i) => bell(mix, g(drop) + i * .03, midi + 12, .26, {...GLASS, pan: -.4 + i * .16}, {decay: 1.8, ratio: 3.5, index: 1.3}));
  pads(lift, shutBeat, .8, true);
  sub(lift, shutBeat, true);
  glass(lift, drop, shutBeat, .16);
  grid(drop, shutBeat, {four: true});
  const motif = (from: number, to: number, velocity: number) => {
    for (let bar = from, n = 0; bar < to - 1e-9; bar += 4, n++) {
      const [, chord] = chordAt(lift.length && bar < shutBeat ? lift : homeBars, bar), tones = [...chord.tones, ...chord.tones.map(t => t + 12)];
      MOTIF.forEach((k, i) => bar + i * .5 < to && bell(mix, g(bar + i * .5), tones[(k + n) % tones.length] + 12, velocity * (1 + i * .1), {...PING, pan: -.3 + i * .2}, {decay: .8, ratio: 3.5, index: 1.3}));
    }
  };
  const homeBars = loopBars(home, logo, HOME, logo);
  motif(drop, shutBeat, .2);
  // Matching Sonnet-5 at 2% of the cost: a bright pair on the swap, a bell glissando as the bars grow.
  run(flow.cameraZoom.at, [85, 88], .18, -.2);
  run(flow.numberSwap.at, [88, 92, 93, 97], .2, .1);
  flow.barsGrow.duration > 0 && run(flow.barsGrow.at, [76, 80, 81, 85, 88, 92, 93, 97], .18, 0, .5);
  // Flow-1 powers Signals: the door closes on a low bell and a sub hit.
  ping(shut, 57, .3, 0, 1.6);
  bass(mix, q(shut), 33, 1, .45, SUB, {drive: 1.2});

  // ── Our agent, built to analyze traces at scale: behind the door the kick drops out; ticks, sub and glass carry on.
  const door = loopBars(Math.ceil(shutBeat + .5), home, DOOR, home), p = issues.prelude;
  pads(door, home, .6);
  sub(door, home, false, .34);
  glass(door, door[0][0], home, .16);
  grid(door[0][0], home - 1, {level: .9});
  ping(p.bashStop, 54, .28, -.2, 1.4);
  run(p.descent.at, [92, 88, 85, 81, 80, 76, 73, 69], .14, .3);
  ping(p.highlight, 88, .22, .2);
  // "At scale": the zoom out climbs in eighths; the circle grows under a slow phrase; the scale-out is the pickup home.
  run(p.zoomOut.at, [69, 73, 76, 80, 81, 85, 88, 92], .13, 0, Math.max(1, Math.round(p.zoomOut.duration / 8 / .125)));
  const grow = at(p.circleGrow.at, 1);
  [[0, 81], [1, 85], [2, 88], [3, 92]].forEach(([b, midi]) => bell(mix, g(grow + b), midi, .22, {...PING, pan: .2}, {decay: 1.2, ratio: 3.5, index: 1.2}));
  run(p.scaleOut, [76, 80, 85, 88, 92], .16, -.2);

  // ── It finds deep issues, in every trace: the four-on-the-floor again, the motif climbing to the logo.
  pads(homeBars, logo, .8, true);
  sub(homeBars, logo, true);
  glass(homeBars, home, logo, .16);
  grid(home, logo - 1, {four: true});
  grid(logo - 1, logo, {level: .7});
  motif(home, logo, .18);
  if (issues.postludeActive) {
    // Issue triangles: a falling cascade of glass.
    cascade(issues.pops, [81, 85, 88, 92, 93, 97, 100]).forEach((note, i) => bell(mix, note.time, note.midi, .2 - i * .01, {...PING, pan: note.pan * .85}, {decay: .7, ratio: 3.5, index: 1.2}));
    // …and clusters them into patterns: a chord of bells under the lock.
    const [, locked] = chordAt(homeBars, beatAt(issues.clusters[0]));
    locked.tones.forEach((midi, i) => bell(mix, q(issues.clusters[0]) + i * .02, midi + 24, .2, {...GLASS, pan: -.3 + i * .2}, {decay: 1.4, ratio: 3.5, index: 1.2}));
  }

  // ── With Laminar: an A major 9 bell chord over the sub; the grid stops and the glass rings out.
  bass(mix, end.logo, 33, end.end - end.logo - .8, .55, SUB, {drive: 1.2});
  kick(mix, end.logo, .34, KIT);
  pad(mix, end.logo, end.end - .4, Amaj9.tones, PAD, {attack: .05, release: 1, cutoff: [1600, 900], level: .8});
  [45, 57, 64, 68, 71, 73, 76, 80].forEach((midi, i) => bell(mix, end.logo + i * .025, midi + 12, .3 - i * .015, {...GLASS, pan: -.4 + i * .11}, {decay: 2.4, ratio: 3.5, index: 1.2}));
  [[.75, 88], [1, 92], [1.25, 93], [1.5, 97]].forEach(([delay, midi], i) => bell(mix, end.logo + delay, midi, .18 - i * .03, {...PING, pan: -.3 + i * .2}, {decay: 1.4, ratio: 3.5, index: 1.2}));
}
