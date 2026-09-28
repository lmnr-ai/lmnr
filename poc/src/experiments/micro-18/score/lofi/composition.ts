import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bass, hat, kick, piano, snare, type Mix, type Route} from '../voices';
import {cascade, chordAt, loopBars, melody, rolled, type Chord, type Progression} from '../writing';
import {rim, vinyl} from './instruments';

/*
 * "Lo-fi Rhodes" — F major, a dusty Rhodes over a lazy half-time beat with swung eighths, all of it
 * through a closed low-pass, tape wow and a record's crackle. Before Flow-1 it is one loop (I – vi – ii – V)
 * that never stops; the picture is answered by small Rhodes licks. At Flow-1 the filter opens, the kit
 * comes in fully and the loop turns brighter (I – iii – IV – V). Behind the Signals door the filter closes
 * again; it opens for the issues and the logo lands on F major 9 with the crackle left running.
 */

const RHODES: Route = {bus: 'music', hall: .2, room: .1, delay: .05};
const LEAD: Route = {bus: 'music', hall: .28, delay: .28};
const KIT: Route = {bus: 'music', room: .14};
const LOW: Route = {bus: 'music', gain: .5};
const DUST: Route = {bus: 'music', gain: .5};

// Rootless voicings; the bass plays the root.
const F: Chord = {bass: 41, tones: [57, 60, 64, 67]}, Am: Chord = {bass: 45, tones: [55, 60, 64, 69]};
const Bb: Chord = {bass: 46, tones: [57, 60, 62, 65]}, C9: Chord = {bass: 36, tones: [58, 62, 64, 69]};
const Dm: Chord = {bass: 38, tones: [53, 57, 60, 64]}, Gm: Chord = {bass: 43, tones: [58, 62, 65, 69]};
const CHILL = [F, Dm, Gm, C9], BRIGHT = [F, Am, Bb, C9], DOOR = [Bb, Am, Gm, C9], HOME = [F, Am, Dm, Bb, C9];
/** The hook: up the F pentatonic and back onto C. */
const THEME = [[0, 69, .5], [.5, 72, .5], [1, 74, 1], [2, 72, .5], [2.5, 77, 1], [3.5, 76, .5], [4, 72, 2]] as const;
/** Swung eighths: the offbeat lands 60 ms late. */
const SWING = .06;

export function composeLofi(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const drop = at(flow.reveal, 1), shut = flow.coverShut, shutBeat = beatAt(shut);
  const home = drop + 4 * Math.round((beatAt(issues.native) - drop) / 4), logo = at(end.logo, 1);
  const lick = (time: number, notes: readonly number[], step: number, velocity: number, pan = .15) =>
    notes.forEach((midi, i) => piano(mix, time + i * step, midi, velocity, {...LEAD, pan: pan + (i % 2 ? .1 : -.1)}, {length: step * 3 + .5, bright: .45}));
  const theme = (beat: number, velocity: number, octave = 0) => melody(mix, g, THEME.map(([b, midi, length]) => [beat + b, midi + octave, length] as const), {...LEAD, pan: .2}, {velocity, bright: .45});

  /** Rhodes comping: pre-Flow one sustained chord and a soft echo per bar; after it, the chord pushes on the swung offbeat. */
  const comp = (bars: Progression, from: number, to: number, full: boolean, velocity: number) => bars.forEach(([beat, chord], i) => {
    const next = Math.min(to, i + 1 < bars.length ? bars[i + 1][0] : to);
    if (beat >= to) return;
    if (!full) {
      rolled(mix, g(beat) + .01, chord.tones, velocity, RHODES, {length: g(next) - g(beat) + .4, bright: .32, spread: .016});
      if (next - beat >= 3) rolled(mix, g(beat + 2.5) + SWING, chord.tones.slice(2), velocity * .55, RHODES, {length: 1, bright: .3, spread: .012});
      return;
    }
    [[0, 1, .95], [1.5, .6, .5], [3, .72, 1]].forEach(([offset, level, length]) => beat + offset < next - 1e-9 &&
      rolled(mix, g(beat + offset) + (offset % 1 ? SWING : .01), chord.tones, velocity * level, RHODES, {length, bright: .4, spread: .012}));
  });
  /** The bass: pre-Flow a held root, after it a root, a swung fifth and a chromatic approach into the next bar. */
  const walk = (bars: Progression, to: number, full: boolean) => bars.forEach(([beat, chord], i) => {
    const next = i + 1 < bars.length ? bars[i + 1] : undefined, stop = Math.min(to, next?.[0] ?? to);
    if (beat >= to) return;
    if (!full) return bass(mix, g(beat), chord.bass, g(stop) - g(beat) - .12, .36, LOW, {drive: 1.1});
    bass(mix, g(beat), chord.bass, .8, .52, LOW, {drive: 1.3});
    if (stop - beat >= 3) bass(mix, g(beat + 2.5) + SWING, chord.bass + 7, .4, .4, LOW, {drive: 1.3});
    if (next && next[0] <= to && next[0] - beat >= 4) bass(mix, g(beat + 3.5) + SWING, next[1].bass - 1, .2, .32, LOW, {drive: 1.2, glide: -1});
  });
  /** The kit on swung eighths, bar lines on the drop: `soft` is kick, cross-stick and closed hat; full adds the snare and ghosts. */
  const groove = (from: number, to: number, full: boolean, level = 1) => {
    for (let step = Math.ceil(from * 2 - 1e-9); step < to * 2 - 1e-9; step++) {
      const s = ((step - drop * 2) % 8 + 8) % 8, t = g(step / 2) + (step % 2 ? SWING : 0) + (mix.random() - .5) * .006;
      if (s === 0 || s === 5) kick(mix, t, (full ? (s ? .28 : .34) : .17) * level, KIT);
      if (s === 4) full ? snare(mix, t, .46 * level, {...KIT, pan: -.05}, .35) : rim(mix, t, .38 * level, {...KIT, pan: -.1});
      if (full && s === 7) snare(mix, t + .125, .1 * level, {...KIT, pan: -.05}, .3);
      if (full && s === 3) kick(mix, t, .13 * level, KIT);
      hat(mix, t, (full ? (s % 2 ? .15 : .24) : (s % 2 ? .07 : .11)) * level, {...KIT, pan: .25}, full && s === 6 ? .06 : .018);
    }
  };

  // ── You build agents: F major 9 unfurls slowly while the record starts turning.
  rolled(mix, u2.agentEnter + .05, [41, ...F.tones, 72], .3, RHODES, {length: 4, bright: .3, spread: .07});
  piano(mix, u2.agentEnter + .9, 84, .2, {...LEAD, pan: .3}, {length: 2.5, bright: .4});

  // ── One loop from the first trace to Flow-1; the kit comes in with the stream and never stops.
  const from = at(u2.stream.at), chill = loopBars(from, drop, CHILL, drop);
  comp(chill, from, drop, false, .2);
  walk(chill, drop, false);
  groove(Math.ceil(from), drop - 2, false, .85);
  groove(drop - 2, drop, false, .5);

  // ── When your agent fails: a soft falling lick; the upward turn climbs, the backtrack rewinds.
  lick(u2.failure, [77, 74, 72, 69], .16, .26);
  lick(u2.upwardTurn.at + .1, [69, 72, 74], u2.upwardTurn.duration / 3, .2, -.1);
  lick(u2.backtrack.at, [89, 86, 84, 81, 79, 77, 74, 72], .05, .17, .3);
  u2.drawers.forEach((time, i) => piano(mix, time, [72, 76, 79][i], .24 + i * .03, {...LEAD, pan: -.2 + i * .2}, {length: 1.8, bright: .45}));
  piano(mix, u2.highlight.at, 81, .18, {...LEAD, pan: .25}, {length: 1.4, bright: .45});

  // ── The insights are hidden across thousands of traces: the hook, softly; the zoom drifts up.
  theme(at(u2.insights, 1) + 1, .26);
  [65, 69, 72, 74, 77, 81, 84, 86, 89].forEach((midi, i) => piano(mix, u2.zoom.at + .4 + (u2.zoom.duration - .4) * i / 9, midi, .1 + i * .01, {...LEAD, pan: -.3 + i * .075}, {length: 1, bright: .4}));
  // If only someone could read them all: a G, the ninth, left hanging.
  piano(mix, u2.ifOnly + .1, 79, .24, {...LEAD, pan: .3}, {length: 3, bright: .45});

  // ── Cheap LLMs: a four-note flick per pass, in its direction; the miss droops a third.
  cost.cheapLegs.forEach(leg => lick(leg.at, leg.direction === 'leftToRight' ? [84, 86, 89, 91] : [91, 89, 86, 84], leg.duration / 4, .15, leg.direction === 'leftToRight' ? -.3 : .3));
  lick(cost.missIssues + .1, [81, 77], .25, .2, 0);
  // Powerful LLMs: the bash window lands on a low octave, the bass doubling it until the budget.
  rolled(mix, cost.bashStop, [29, 41], .3, RHODES, {length: 2.4, bright: .25, spread: .006});
  chill.forEach(([b, chord]) => b >= at(cost.powerful, 1) && b < at(cost.cameraToBudget.at, 1) && bass(mix, g(b) + .004, chord.bass - 12, 1.6, .3, LOW, {drive: 1.1}));
  piano(mix, cost.budgetAppear, 84, .18, {...LEAD, pan: -.1}, {length: 1.2, bright: .45});

  // ── …but the costs are unsustainable: the hook sinks while the loop keeps going; until now, the pickup.
  const depletion = at(cost.depletion.at);
  melody(mix, g, [[depletion, 84, 1], [depletion + 1, 81, 1], [depletion + 2, 77, 1], [depletion + 3, 74, 2]], {...LEAD, pan: .2}, {velocity: .22, bright: .4});
  [65, 69, 72, 74, 77, 81, 84, 86].forEach((midi, i) => piano(mix, g(drop - 1) + i * .0625, midi, .14 + i * .02, {...LEAD, pan: -.4 + i * .11}, {length: 1, bright: .5}));

  // ── Introducing Flow-1: the filter opens, the kit comes in fully, the loop brightens and the hook sings.
  const bright = loopBars(drop, shutBeat, BRIGHT, drop);
  rolled(mix, flow.reveal - .2, [29, 41, ...F.tones, 72, 76], .42, RHODES, {length: 3, bright: .5, spread: .01});
  comp(bright, drop, shutBeat, true, .32);
  walk(bright, shutBeat, true);
  groove(drop, shutBeat, true);
  theme(drop + 1, .36, 12);
  theme(drop + 9, .3);
  // Matching Sonnet-5 at 2% of the cost: a happy lick up on the swap, a glissando as the bars (Animation 21: the graph) grow.
  lick(flow.cameraZoom.at, [81, 84], .12, .2, -.2);
  // Animation 21 has no number swap: the lick climbs with the six bead landings instead, flow-1's (the third) leaning in.
  if (flow.animation21) flow.numberDrops.forEach((time, i) => piano(mix, time, [79, 81, 84, 86, 89, 91][i], i === 2 ? .27 : .19, {...LEAD, pan: -.3 + i * .12}, {length: .8, bright: .5}));
  else lick(flow.numberSwap.at, [81, 84, 86, 89], .08, .22, .1);
  [77, 79, 81, 84, 86, 89, 91, 93, 96].forEach((midi, i) => piano(mix, flow.barsGrow.at + flow.barsGrow.duration * (i / 8) ** 1.15, midi, .18 + i * .012, {...LEAD, pan: -.4 + i * .1}, {length: i === 8 ? 2.2 : .5, bright: .55}));
  // Flow-1 powers Signals: the hook climbs; the door closes on a chord and the filter with it.
  const engine = at(flow.cameraToEngine.at, 1);
  melody(mix, g, [[engine, 72, 1], [engine + 1, 74, 1], [engine + 2, 77, .5], [engine + 2.5, 81, 1.5]], {...LEAD, pan: .2}, {velocity: .32, bright: .45});
  rolled(mix, shut, [34, 46, ...Bb.tones, 69], .34, RHODES, {length: 2.4, bright: .4, spread: .012});

  // ── Our agent, built to analyze traces at scale: behind the door the loop keeps turning, muffled, the kit soft.
  const door = loopBars(Math.ceil(shutBeat + .5), home, DOOR, home), p = issues.prelude;
  comp(door, door[0][0], home, false, .24);
  walk(door, home, false);
  groove(Math.ceil(shutBeat + 1), home - 1, false, .9);
  lick(p.bashStop, [58, 70], .01, .24, -.2);
  lick(p.descent.at, [89, 86, 84, 81, 79, 77, 74, 72], p.descent.duration / 8, .14, .3);
  piano(mix, p.highlight, 84, .2, {...LEAD, pan: .2}, {length: 1.4, bright: .45});
  // "At scale": the zoom out climbs the pentatonic; the circle grows under the hook; the scale-out is the pickup home.
  [65, 69, 72, 74, 77, 81, 84, 86, 89, 93].forEach((midi, i) => piano(mix, p.zoomOut.at + p.zoomOut.duration * (i / 10) ** 1.2, midi, .13 + i * .01, {...LEAD, pan: -.4 + i * .09}, {length: .8, bright: .45}));
  theme(at(p.circleGrow.at, 1), .26);
  lick(p.scaleOut, [72, 74, 77, 81, 84], .07, .16, -.2);

  // ── It finds deep issues, in every trace: the filter opens again and the kit comes back.
  const homeBars = loopBars(home, logo, HOME, logo);
  comp(homeBars, home, logo, true, .3);
  walk(homeBars, logo, true);
  groove(home, logo - 1, true);
  groove(logo - 1, logo, false, .6);
  if (issues.postludeActive) {
    // Issue triangles land as Rhodes drops, falling down the pentatonic.
    cascade(issues.pops, [77, 79, 81, 84, 86, 89, 91, 93, 96]).forEach((note, i) => piano(mix, note.time, note.midi, .2 - i * .008, {...LEAD, pan: note.pan * .85}, {length: 1, bright: .5}));
    // …and clusters them into patterns: a chord lands under the lock; ready for you, the hook settles.
    const lock = issues.clusters[0], [, locked] = chordAt(homeBars, beatAt(lock));
    rolled(mix, lock, [locked.bass, ...locked.tones, locked.tones[3] + 12], .36, RHODES, {length: 2.5, bright: .45, spread: .01});
    melody(mix, g, [[at(issues.ready, 1), 76, 1.5], [at(issues.ready, 1) + 1.5, 74, .5], [at(issues.ready, 1) + 2, 72, 2]], {...LEAD, pan: .2}, {velocity: .26, bright: .45});
  }

  // ── Unlock the insights: IV → V under the hook an octave up, the kit filling into the logo.
  theme(at(end.start, 1) + .5, .34, 12);
  for (let n = 0; n < 4; n++) snare(mix, g(logo - 1 + n * .25), .12 + n * .05, {...KIT, pan: -.2 + n * .12}, .4);

  // ── With Laminar: F major 9 with the bass underneath; the kit stops, the Rhodes rings out over the crackle.
  bass(mix, end.logo, 29, end.end - end.logo - .8, .5, LOW, {drive: 1.1});
  kick(mix, end.logo, .34, KIT);
  rolled(mix, end.logo, [41, 53, ...F.tones.map(t => t + 12), 84], .42, RHODES, {length: end.end - end.logo, bright: .45, spread: .025});
  [[.8, 84], [1.1, 86], [1.4, 89], [1.8, 93]].forEach(([delay, midi], i) => piano(mix, end.logo + delay, midi, .2 - i * .03, {...LEAD, pan: -.3 + i * .2}, {length: 2, bright: .45}));

  // The low-pass: closed before Flow-1 and behind the door, open for the drop, the issues and the logo.
  const glide = (t: number, a: number, b: number, from: number, to: number) => from * (to / from) ** Math.min(1, Math.max(0, (t - a) / (b - a)));
  const open = g(drop) + .05, closing = shut + .1, reopen = g(home);
  mix.sweep(t => t < open ? glide(t, g(drop - 2), open, 2800, 20_000)
    : t < reopen - 1 ? glide(t, closing, closing + .5, 20_000, 3400)
    : glide(t, reopen - 1, reopen, 3400, 20_000));
  mix.wow(.0022);
  vinyl(mix, 0, cues.duration, .35, DUST);
}
