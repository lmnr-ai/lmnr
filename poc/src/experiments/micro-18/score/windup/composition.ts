import type {ScoreCues} from '../cues';
import {MUSIC_BOX, WOOD, brush, chordAt, eachChord, glowPad, modal, pulse, softKick, string, sub, toneOf, voiceBed, voiceGaps, type Chord} from '../rounded';
import {bell, type Mix, type Route} from '../voices';

/*
 * Windup — G major, swung 112 BPM. The agent is a clockwork toy: a tick-tock escapement keeps
 * its time, a music box sings its thoughts, a plucked-string bass walks under it. The budget
 * literally winds down (the whole music bus slows to a stop), and Flow-1 is the key turned all
 * the way: a bouncy I–vi–IV–V toy-band groove with a music-box tune on top.
 */

export const BEAT = 60 / 112;
const SWING = .64;
const BOX: Route = {bus: 'music', room: .3, hall: .25, delay: .08};
const CLOCK: Route = {bus: 'music', room: .25};
const LOW: Route = {bus: 'music', room: .12};
const PAD: Route = {bus: 'music', hall: .45, room: .12};

type Voicing = Omit<Chord, 'at'>;
const G: Voicing = {bass: 43, pad: [59, 62, 66, 69]};
const EM: Voicing = {bass: 40, pad: [59, 62, 64, 67]};
const C: Voicing = {bass: 36, pad: [60, 62, 64, 67]};
const C_LYD: Voicing = {bass: 36, pad: [59, 62, 64, 66]};
const D: Voicing = {bass: 38, pad: [57, 62, 66, 69]};
const DSUS: Voicing = {bass: 38, pad: [57, 62, 67, 69]};
const AM: Voicing = {bass: 45, pad: [57, 60, 64, 67]};
const BM: Voicing = {bass: 47, pad: [57, 59, 62, 66]};
const EB: Voicing = {bass: 39, pad: [58, 62, 65, 67]};

/** Swung time of beat-grid position `index` (beats; .5 lands late). */
export const swung = (anchor: number, index: number) => {
  const whole = Math.floor(index + 1e-9), part = index - whole;
  return anchor + (whole + (Math.abs(part - .5) < 1e-6 ? SWING : part)) * BEAT;
};

export function windupPlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bar = (n: number) => flow.reveal + n * BEAT * 4;
  const c = (at: number, v: Voicing): Chord => ({at, ...v});
  const flowBars = [G, EM, C, D, G, EM, C, D, G, EM, C, DSUS].map((v, i) => c(bar(i), v)).filter(chord => chord.at < flow.cameraToEngine.at);
  return [
    c(0, G), c(u2.stream.at + 2.2, EM), c(u2.stream.at + 4.4, C), c(u2.failure, AM), c(u2.backtrack.at, C_LYD), c(u2.warning, BM),
    c(u2.insights, C), c(u2.zoom.at + 1.4, D), c(u2.cloudIn.at, DSUS),
    c(cost.cloudOut.at, EM), c(cost.thinkingDrop.at, C), c(cost.bashStop, AM), c(cost.cameraToBudget.at, C), c(cost.depletion.at, EB), c(cost.depletion.at + cost.depletion.duration, DSUS),
    ...flowBars, c(flow.cameraToEngine.at, DSUS),
    c(issues.prelude.bashEntry.at, AM), c(issues.prelude.bubble ?? issues.prelude.bashStop, C), c(issues.prelude.explanation?.at ?? issues.prelude.highlight, G),
    c(issues.prelude.zoomOut.at, EM), c(issues.native, C), c(issues.native + BEAT * 4, D), c(issues.native + BEAT * 8, G),
    c(issues.windowDown.at, EM), c(issues.messageSend, C), c(conclusion.start, C), c(conclusion.start + 2, DSUS), c(conclusion.logo, G),
  ].sort((a, b) => a.at - b.at);
}

/** The toy tune over I–vi–IV–V: [beat within the 4-bar phrase, midi, velocity]. */
const TUNE: readonly (readonly [number, number, number])[] = [
  [0, 74, 1], [1, 71, .7], [1.5, 74, .8], [2, 79, 1], [3, 78, .7], [3.5, 76, .6],
  [4, 76, 1], [5, 74, .7], [5.5, 71, .8], [6, 67, .9], [7, 71, .7],
  [8, 72, 1], [9, 76, .7], [9.5, 79, .8], [10, 84, 1], [11, 79, .7], [11.5, 76, .6],
  [12, 78, 1], [13, 74, .7], [13.5, 78, .8], [14, 81, 1], [15, 78, .6], [15.5, 74, .7],
];

export function composeWindup(mix: Mix, cues: ScoreCues) {
  const plan = windupPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues, end = cues.duration;
  const grid = pulse(flow.reveal, BEAT);
  voiceBed(mix, cues, .72);
  const box = (time: number, midi: number, velocity: number, pan = 0) => modal(mix, time, midi, velocity, {...BOX, pan}, MUSIC_BOX, {mallet: 5200, malletLevel: .18, name: 'musicBox'});
  const tickTock = (from: number, to: number, level: number, every = 1) => {
    for (const {time, index} of grid.steps(from, to, 1)) {
      const beat = Math.round(index) + 4096;
      if (beat % every) continue;
      modal(mix, time, beat % 2 ? 84 : 91, (beat % 2 ? .38 : .3) * level, {...CLOCK, pan: beat % 2 ? -.25 : .25}, WOOD, {mallet: 4200, malletLevel: .6, name: 'escapement'});
    }
  };

  // The reed-organ bed: soft, a little bright, breathing under everything but the wind-down silence.
  const bed = (start: number, stop: number) => eachChord(plan, start, stop, (chord, from, to) => {
    glowPad(mix, from, to + .2, chord.pad, PAD, {attack: from < .1 ? 1.6 : .45, release: 1.2, level: .8, bright: .9, breathe: .12});
    if (from > u2.stream.at) sub(mix, from, to, chord.bass - 12 >= 26 ? chord.bass - 12 : chord.bass, LOW, {level: .32, attack: .15, release: .4});
  });
  bed(0, cost.depletion.at + cost.depletion.duration);

  // Ultimate2: the escapement starts with the stream and stops dead on the failure.
  tickTock(u2.stream.at, u2.failure, .9);
  tickTock(u2.insights, u2.cloudIn.at + 1.5, .7, 2);
  const walk = (from: number, to: number, level: number) => {
    for (const {time, index} of grid.steps(from, to, 1)) {
      const beat = Math.round(index) + 4096, chord = chordAt(plan, time);
      const root = chord.bass - (chord.bass > 43 ? 12 : 0);
      const note = [root, root + 7, root + 12, root + 7][beat % 4];
      string(mix, time, note, .7 * level, LOW, {length: .6, damping: .992, bright: .3});
    }
  };
  walk(u2.stream.at + BEAT * 2, u2.failure, .7);
  // Music-box chords wake with the insights, one broken chord per bar.
  for (const {time, index} of grid.steps(u2.insights, u2.cloudIn.at + 1, 1)) {
    if ((Math.round(index) + 4096) % 2) continue;
    [0, 1, 2].forEach(i => box(time + i * .09, toneOf(chordAt(plan, time), i, 71), .45 - i * .08, -.3 + i * .3));
  }

  // Cost: the cheap agents bounce along a swung tick; the powerful one clanks at half time.
  tickTock(cost.cloudOut.at + .6, cost.bashStop, 1);
  walk(cost.cloudOut.at + .6, cost.bashStop, .8);
  for (const {time, index} of grid.steps(cost.bashStop, cost.cameraToBudget.at, 1)) {
    const beat = Math.round(index) + 4096, chord = chordAt(plan, time);
    if (beat % 2 === 0) string(mix, time, chord.bass - 12 >= 26 ? chord.bass - 12 : chord.bass, .9, LOW, {length: 1, damping: .994, bright: .2});
    modal(mix, time, beat % 2 ? 79 : 86, .32, {...CLOCK, pan: beat % 2 ? -.25 : .25}, WOOD, {mallet: 3000, malletLevel: .6, name: 'escapement'});
  }
  // The budget melody: the music box plays while it can, then the spring runs out.
  const run = cost.depletion.at, stop = run + cost.depletion.duration;
  tickTock(cost.cameraToBudget.at, stop, .9);
  [76, 74, 72, 71, 69, 67, 66, 67].forEach((midi, i) => box(cost.budgetRun.at + i * BEAT * .5, toneOf(chordAt(plan, cost.budgetRun.at + i * BEAT * .5), 0, midi), .5));
  for (const {time, index} of grid.steps(run, stop, 2)) box(time, toneOf(chordAt(plan, time), [0, 2, 1, 3][Math.round(index * 2 + 4096) % 4], 70), .4);
  mix.tapeStop(run + cost.depletion.duration * .35, cost.depletion.duration * .75, 1.4);
  // tapeStop silences everything already emitted after it, so the rest of the bed is laid afterwards.
  bed(flow.reveal, end);

  // Flow-1: the toy band.
  const groove = (from: number, to: number, level: number, tune: boolean) => {
    for (const {time: straight, index} of grid.steps(from, to, 2)) {
      const eighth = Math.round(index * 2) + 8192, inBar = eighth % 8, beatIndex = index;
      const time = swung(flow.reveal, beatIndex), chord = chordAt(plan, straight);
      if (inBar === 0 || inBar === 4) softKick(mix, time, .55 * level, CLOCK, 31);
      if (inBar === 2 || inBar === 6) { modal(mix, time, 76, .5 * level, {...CLOCK, pan: .15}, WOOD, {mallet: 2800, malletLevel: .8, name: 'block'}); brush(mix, time, .35 * level, CLOCK, {length: .12, hz: 3000}); }
      modal(mix, time, eighth % 2 ? 96 : 91, (eighth % 2 ? .22 : .16) * level, {...CLOCK, pan: -.3}, WOOD, {mallet: 6000, malletLevel: .5, name: 'escapement'});
      const root = chord.bass - (chord.bass > 43 ? 12 : 0);
      if (inBar % 2 === 0) string(mix, time, [root, root + 7, root + 12, root + 7][inBar / 2], .75 * level, LOW, {length: .5, damping: .99, bright: .35});
      if (inBar === 3 || inBar === 7) [1, 2].forEach(i => box(time, toneOf(chord, i, 62), .22 * level, i === 1 ? -.35 : .35));
    }
    if (!tune) return;
    const phrase = BEAT * 16;
    for (let start = flow.reveal + Math.max(0, Math.ceil((from - flow.reveal) / phrase)) * phrase; start < to - .1; start += phrase)
      for (const [beat, midi, velocity] of TUNE) {
        const time = swung(start, beat);
        if (time < to) box(time, midi, .55 * velocity * level, .1);
      }
  };
  groove(flow.reveal, flow.cameraToEngine.at + BEAT * 2, 1, true);
  groove(flow.cameraToEngine.at + BEAT * 2, issues.prelude.zoomOut.at, .7, false);
  groove(issues.native + BEAT * 4, conclusion.start, .9, false);

  // A toy fanfare, 5–1–3–5, answers each pause in the narration.
  for (const gap of voiceGaps(cues, 1)) {
    if (gap.at < .3 || (gap.at > cost.depletion.at && gap.at < flow.cameraToEngine.at)) continue;
    const start = grid.steps(gap.at + .1, gap.at + gap.duration)[0]?.time;
    if (start === undefined || start > gap.at + gap.duration - .4) continue;
    const chord = chordAt(plan, start), root = toneOf(chord, 0, 67);
    [-5, 0, 4, 7].forEach((interval, i) => box(start + [0, .5, .75, 1][i] * BEAT, toneOf(chord, 0, root + interval), .5 - i * .04, -.2 + i * .15));
  }

  // Logo: the tune's last phrase lands on G, a small bell rings, the spring clicks home.
  const logo = conclusion.logo;
  [67, 71, 74, 79, 83].forEach((midi, i) => box(logo + i * .07, midi, .6 - i * .06, -.4 + i * .2));
  bell(mix, logo + .45, 86, .45, {...BOX, delay: .2}, {decay: 2.2, ratio: 2, index: .8});
  glowPad(mix, logo, end, [55, 62, 67, 71, 74], PAD, {attack: .2, release: 2, level: 1.1, bright: .7});
  string(mix, logo, 31, .9, LOW, {length: 2.4, damping: .998, bright: .3});
}
