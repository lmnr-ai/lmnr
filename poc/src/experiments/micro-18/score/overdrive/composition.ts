import type {ScoreCues} from '../cues';
import {chordAt, pulse, toneOf, voiceBed, voiceGaps, type Chord} from '../rounded';
import {bass, bowed, clap, hat, impact, reverseSwell, riser, snare, timpani, type Mix, type Pump, type Route} from '../voices';
import {cymbal} from '../bluenote/instruments';
import {bigKick, braam, lead, stab, supersaw, taiko} from './instruments';

/*
 * Overdrive — everything at eleven. A 128 BPM trailer/festival hybrid: the film opens on a braam and
 * never sits still. D minor, driving celli and four-on-the-floor through Ultimate2; the failure is a
 * glitch into a slam and silence; the insights build to a fake-out. "Powerful" gets taiko and
 * braams, the budget tape-stops, and "Until now." is a snare roll into a D major festival drop.
 * Issues drops again, and the logo lands a semitone up on the biggest hit in the film.
 */

export const BEAT = 60 / 128;
const BAR = BEAT * 4;
const PAD: Route = {bus: 'music', hall: .35, room: .05};
const LOW: Route = {bus: 'music', room: .04};
const KIT: Route = {bus: 'music', room: .12, hall: .05};
const BIG: Route = {bus: 'music', room: .15, hall: .45};
const STR: Route = {bus: 'music', room: .2, hall: .3};
const LEAD: Route = {bus: 'music', room: .1, hall: .25, delay: .25};

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
const DM = v(38, 62, 65, 69, 74), BB = v(34, 62, 65, 70, 74), F = v(41, 60, 65, 69, 72), C = v(36, 60, 64, 67, 72);
const GM = v(43, 62, 67, 70, 74), A = v(45, 61, 64, 69, 73), A_MAJ = v(45, 61, 64, 69, 76), BB_LYD = v(34, 62, 64, 69, 74);
const D = v(38, 62, 66, 69, 74), BM = v(47, 62, 66, 71, 74), G = v(43, 62, 67, 71, 74), EB = v(39, 63, 67, 70, 75);

export function overdrivePlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bars = pulse(flow.reveal, BAR);
  const c = (at: number, voicing: Voicing): Chord => ({at, ...voicing});
  const loop = (from: number, to: number, cycle: readonly Voicing[]) =>
    [c(from, cycle[0]), ...bars.steps(from + BEAT * 1.5, to - BEAT).map((step, i) => c(step.time, cycle[(i + 1) % cycle.length]))];
  const epic = [DM, BB, F, C], festival = [D, A, BM, G];
  return [
    ...loop(0, u2.failure, epic), c(u2.failure, BB_LYD), c(u2.backtrack.at, GM), c(u2.highlight.at, A),
    ...loop(u2.insights, u2.cloudIn.at + .47, epic), c(u2.cloudIn.at + .47, A), c(u2.ifOnly, BB),
    ...loop(cost.cloudOut.at - .45, cost.bashStop, epic), ...loop(cost.bashStop, cost.depletion.at, [DM, BB, GM, A]), c(cost.depletion.at, DM), c(cost.depletion.at + 1.6, A_MAJ),
    ...loop(flow.reveal, flow.coverShut, festival), c(flow.coverShut, BB_LYD),
    ...loop(issues.leadIn.at, issues.prelude.zoomOut.at, epic), c(issues.prelude.zoomOut.at, GM), c(issues.prelude.circleGrow.at, A_MAJ),
    ...loop(issues.native, conclusion.start, festival), c(conclusion.start, G), c(conclusion.start + BAR, A_MAJ), c(conclusion.start + BAR * 1.5, BB_LYD),
    c(conclusion.logo, EB),
  ].sort((a, b) => a.at - b.at);
}

export function composeOverdrive(mix: Mix, cues: ScoreCues) {
  const plan = overdrivePlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues, end = cues.duration;
  const grid = pulse(flow.reveal, BEAT), bars = pulse(flow.reveal, BAR);
  const sixteenthOf = (index: number) => ((Math.round(index * 4) % 16) + 4096) % 16;
  voiceBed(mix, cues, .62);
  const pump: Pump = {origin: flow.reveal - BAR * 40, period: BEAT, depth: .55};

  /** Everything hits: braam, taiko, impact, crash, timpani. `size` scales the lot. */
  const slam = (time: number, size: number, chord = chordAt(plan, time), length = 1.6) => {
    braam(mix, time, [chord.bass - 12, chord.bass, chord.bass + 7], length, .42 * size, BIG);
    taiko(mix, time, .55 * size, BIG); taiko(mix, time + .012, .4 * size, {...BIG, pan: .3}, .8);
    impact(mix, time, .4 * size, BIG);
    timpani(mix, time, chord.bass, .5 * size, BIG, {decay: 1.8});
    cymbal(mix, time, 'crash', .75 * size, {...KIT, pan: -.35}, {decay: 2.4}); cymbal(mix, time + .006, 'crash', .6 * size, {...KIT, pan: .4}, {decay: 2});
    bigKick(mix, time, .42 * size, KIT, .6);
  };
  /** Accelerating snare roll from eighths to thirty-seconds with a crescendo, landing on `to`. */
  const roll = (from: number, to: number, level = 1, fromRate = 2, toRate = 8) => {
    for (let t = from; t < to - .02;) {
      const p = (t - from) / (to - from), rate = fromRate * (toRate / fromRate) ** (p ** 1.4);
      snare(mix, t, (.18 + .7 * p ** 1.5) * level, {...KIT, pan: -.1}, .55 + .35 * p);
      t += BEAT / rate;
    }
  };
  /** Build into `to`: roll, riser, rising violins and a reversed swell on the chord at `to`. */
  const build = (from: number, to: number, level = 1) => {
    roll(from, to, level);
    riser(mix, from, to, {bus: 'music', hall: .35}, {level: .45 * level, fromMidi: 45, toMidi: 93});
    const top = toneOf(chordAt(plan, to), 2, 74);
    bowed(mix, from, to, top - 12, STR, {section: 'violins', dynamics: [.2, 1], attack: .3, release: .1, level: .9 * level});
    bowed(mix, from, to, top, STR, {section: 'violins', dynamics: [.2, 1], attack: .3, release: .1, level: .7 * level});
    reverseSwell(mix, to, Math.min(1.4, to - from), chordAt(plan, to).pad.map(midi => midi + 12), {bus: 'music', hall: .5});
  };

  /** The engine room: which layers play from `from` to `to` and how hard. */
  type Drive = {kick?: boolean; clap?: boolean; hats?: 8 | 16; bass?: 'roll' | 'pulse'; pad?: [number, number]; celli?: boolean; taiko?: boolean; braams?: boolean; lead?: boolean; level?: number};
  const drive = (from: number, to: number, spec: Drive) => {
    const level = spec.level ?? 1;
    for (const {time, index} of grid.steps(from, to, 4)) {
      const s = sixteenthOf(index), chord = chordAt(plan, time), beat = s % 4 === 0;
      if (spec.kick && beat) bigKick(mix, time, .85 * level, KIT);
      if (spec.clap && (s === 4 || s === 12)) { clap(mix, time, .7 * level, {...KIT, pan: .05}); snare(mix, time, .45 * level, KIT, .7); }
      if (spec.hats === 16) hat(mix, time, (s % 2 ? .28 : .4) * level, {...KIT, pan: .3}, .02);
      if (spec.hats && s % 4 === 2) cymbal(mix, time, 'openHat', .45 * level, {...KIT, pan: -.25}, {decay: .16});
      if (spec.bass === 'roll' && !beat) bass(mix, time, chord.bass - (chord.bass > 40 ? 12 : 0) + (s % 4 === 3 ? 12 : 0), BEAT / 4 * .85, .9 * level, LOW, {drive: 2.6});
      if (spec.bass === 'pulse' && s % 2 === 0) bass(mix, time, chord.bass - (chord.bass > 40 ? 12 : 0), BEAT / 2 * .8, (beat ? .95 : .7) * level, LOW, {drive: 2.2});
      if (spec.celli) {
        const pattern = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 0][s], root = chord.bass < 36 ? chord.bass + 12 : chord.bass;
        bowed(mix, time, time + BEAT / 4 * .8, root + pattern, {...STR, pan: -.3}, {section: 'celli', dynamics: [s % 4 === 0 ? 1 : .75, .6], attack: .006, release: .06, level: .85 * level, bright: .8});
      }
      if (spec.taiko && (s === 0 || s === 6 || s === 8 || s === 10 || (s === 14 && Math.round(index) % 8 === 7))) taiko(mix, time, (s === 0 ? .9 : .6) * level, {...BIG, pan: s === 6 ? -.3 : s === 10 ? .3 : 0}, s === 0 ? 1 : 1.15);
    }
    if (spec.braams) for (const {time, index} of bars.steps(from, to - BEAT)) if (Math.round(index) % 2 === 0) { const chord = chordAt(plan, time); braam(mix, time, [chord.bass - 12, chord.bass], BAR * 1.2, .4 * level, BIG); }
    if (spec.pad) {
      const [low, high] = spec.pad;
      let at = from;
      for (const chord of plan.filter(chord => chord.at > from && chord.at < to).concat([{at: to, bass: 0, pad: []}])) {
        const current = chordAt(plan, at + .01);
        supersaw(mix, at, chord.at, current.pad, PAD, {level: .9 * level, cutoff: [low + (high - low) * (at - from) / (to - from), low + (high - low) * (chord.at - from) / (to - from)], attack: .02, release: .2, pump});
        supersaw(mix, at, chord.at, [current.bass], LOW, {level: .5 * level, cutoff: [400, 400], attack: .02, release: .15, pump});
        at = chord.at;
      }
    }
    if (spec.lead) for (const gap of voiceGaps(cues, .55)) {
      if (gap.at < from || gap.at > to) continue;
      const start = grid.steps(gap.at, gap.at + gap.duration, 2)[0]?.time;
      if (start === undefined) continue;
      const hook = [[0, 4, .5], [.5, 4, .5], [1, 5, .5], [1.5, 4, .5], [2, 6, 1], [3, 5, .5], [3.5, 4, 1.5]] as const;
      for (const [beats, index, hold] of hook) {
        const at = start + beats * BEAT; if (at > Math.min(to, gap.at + gap.duration) - .08) break;
        lead(mix, at, toneOf(chordAt(plan, at), index, 69), BEAT * hold * .9, .85 * level, {...LEAD, pan: .1}, {from: beats === 2 ? toneOf(chordAt(plan, at), index, 69) - 5 : undefined});
      }
    }
  };
  const crashes = (from: number, to: number, level = .6) => { for (const {time, index} of bars.steps(from, to)) if (Math.round(index) % 4 === 0) cymbal(mix, time, 'crash', level, {...KIT, pan: .35}, {decay: 2}); };

  // ------------------------------------------------ Ultimate2: the braam, the drive and the slam.
  slam(0, .85, chordAt(plan, 0), 2.2);
  drive(u2.firstThinking.at, u2.stream.at, {celli: true, pad: [300, 600], level: .7});
  drive(u2.stream.at, u2.failure - BEAT, {kick: true, clap: true, hats: 8, bass: 'pulse', celli: true, pad: [600, 3000], level: .9});
  roll(u2.failure - BAR, u2.failure, .8);
  riser(mix, u2.failure - BAR * 1.5, u2.failure, {bus: 'music', hall: .3}, {level: .35, fromMidi: 50, toMidi: 86});
  mix.stutter(u2.failure - BEAT, BEAT / 8, 8);
  slam(u2.failure, 1.1, chordAt(plan, u2.failure), 1.2);
  // The silence after: a heartbeat and a timpani pulse under "the trace can tell you why".
  for (const {time} of grid.steps(u2.failure + BEAT * 2, u2.backtrack.at)) { bigKick(mix, time, .45, KIT, .25); timpani(mix, time, 38, .35, BIG, {decay: .6}); }
  drive(u2.backtrack.at, u2.warning, {kick: true, taiko: true, celli: true, bass: 'pulse', pad: [500, 1800], level: .85});
  slam(u2.warning, .75);
  drive(u2.warning + BEAT, u2.insights, {celli: true, taiko: true, level: .8});
  slam(u2.insights, .9, chordAt(plan, u2.insights), 1.4);
  drive(u2.insights + BEAT, u2.cloudIn.at + .47, {kick: true, clap: true, hats: 16, bass: 'roll', celli: true, pad: [400, 9000], level: .95});
  build(u2.zoom.at + 1.5, u2.cloudIn.at + .47, 1);
  // The fake-out: the build hits the top and the tape dies.
  mix.tapeStop(u2.cloudIn.at + .47, .45, 1.2);
  // "If only" sits over a single braam and a timpani roll back up.
  braam(mix, u2.ifOnly - .05, [34 - 12, 34, 41], 2.2, .75, BIG);
  for (let t = u2.ifOnly + .3, i = 0; t < cost.cloudOut.at - .45; t += .06, i++) timpani(mix, t, 38, .1 + .5 * (t - u2.ifOnly) / (cost.cloudOut.at - u2.ifOnly), BIG, {decay: .4});

  // ------------------------------------------------ Cost: the driving middle, then "powerful".
  slam(cost.cloudOut.at - .45, .8);
  drive(cost.cloudOut.at - .45 + BEAT, cost.bashStop - BAR * .75, {kick: true, clap: true, hats: 16, bass: 'roll', celli: true, pad: [900, 4000], level: .95});
  build(cost.cameraToBash.at, cost.bashStop, 1.1);
  slam(cost.bashStop, 1.25, chordAt(plan, cost.bashStop), 2);
  drive(cost.bashStop + BEAT, cost.depletion.at, {kick: true, clap: true, hats: 16, bass: 'pulse', celli: true, taiko: true, braams: true, pad: [2000, 7000], level: 1});
  crashes(cost.bashStop + BEAT, cost.depletion.at);
  // The budget runs out: the whole band grinds to a halt.
  mix.tapeStop(cost.depletion.at, 1.5, 1.4);

  // "Until now.": a heartbeat, then the roll that detonates the drop. A breath of silence first.
  for (const time of [cost.depletion.at + 1.7, cost.depletion.at + 2.25]) bigKick(mix, time, .5, KIT, .3);
  roll(cost.depletion.at + 2.5, flow.reveal - BEAT / 4, 1.1, 1, 16);
  riser(mix, cost.depletion.at + 2.5, flow.reveal - BEAT / 4, {bus: 'music', hall: .4}, {level: .6, fromMidi: 40, toMidi: 100});
  reverseSwell(mix, flow.reveal, 1.2, D.pad.map(midi => midi + 12), {bus: 'music', hall: .6});

  // ------------------------------------------------ Flow-1: THE DROP.
  slam(flow.reveal, 1.3, chordAt(plan, flow.reveal), 2);
  stab(mix, flow.reveal, D.pad, .5, 1, PAD);
  drive(flow.reveal, flow.cameraToEngine.at - BAR * .5, {kick: true, clap: true, hats: 16, bass: 'roll', celli: true, pad: [5000, 9000], lead: true, level: 1});
  crashes(flow.reveal + BAR, flow.cameraToEngine.at);
  for (const {time, index} of grid.steps(flow.reveal + BAR, flow.cameraToEngine.at - BAR * .5, 2)) if (Math.round(index * 2) % 8 === 3 || Math.round(index * 2) % 8 === 6) stab(mix, time, chordAt(plan, time).pad, .12, .55, {...PAD, pan: .2});
  build(flow.cameraToEngine.at - BAR * .5, flow.cameraToEngine.at, .9);
  slam(flow.cameraToEngine.at, 1.1);
  drive(flow.cameraToEngine.at + BEAT, flow.coverShut - BEAT / 2, {kick: true, clap: true, hats: 16, bass: 'roll', pad: [7000, 9000], celli: true, level: 1});
  roll(flow.coverShut - BEAT * 2, flow.coverShut, .8, 4, 16);
  slam(flow.coverShut, 1.15, chordAt(plan, flow.coverShut), 1.6);
  riser(mix, flow.coverShut + .8, issues.leadIn.at, {bus: 'music', hall: .4}, {level: .3, fromMidi: 50, toMidi: 80});

  // ------------------------------------------------ Issues: trailer half-time, the build, drop two.
  slam(issues.leadIn.at, .85);
  drive(issues.leadIn.at + BEAT, issues.prelude.zoomOut.at, {taiko: true, celli: true, hats: 16, bass: 'pulse', braams: true, pad: [700, 2500], level: .85});
  drive(issues.prelude.zoomOut.at, issues.native, {kick: true, celli: true, pad: [800, 9000], level: .95});
  build(issues.prelude.zoomOut.at + .5, issues.native, 1.1);
  slam(issues.native, 1.25, chordAt(plan, issues.native), 2);
  stab(mix, issues.native, D.pad, .5, 1, PAD);
  drive(issues.native, conclusion.start, {kick: true, clap: true, hats: 16, bass: 'roll', celli: true, pad: [6000, 9000], lead: true, level: 1});
  crashes(issues.native + BAR, conclusion.start);
  slam(issues.clusters[0], .9);

  // ------------------------------------------------ Conclusion: the last build, a key change, the biggest hit.
  const logo = conclusion.logo;
  drive(conclusion.start, logo - BEAT, {kick: true, hats: 16, bass: 'pulse', celli: true, pad: [1500, 9000], level: 1});
  for (const {time} of grid.steps(logo - BAR, logo - BEAT / 2, 2)) bigKick(mix, time, .8, KIT, .2);
  build(conclusion.start + BAR * .5, logo, 1.25);
  slam(logo, 1.4, chordAt(plan, logo), 2.2);
  stab(mix, logo, EB.pad, .6, 1.1, PAD);
  supersaw(mix, logo, end - .3, [...EB.pad, 82], PAD, {level: 1.2, cutoff: [9000, 1500], attack: .01, release: .6});
  bowed(mix, logo, end - .2, 51, STR, {section: 'celli', dynamics: [1, .6], attack: .02, release: .5});
  bowed(mix, logo, end - .2, 82, STR, {section: 'violins', dynamics: [1, .7], attack: .02, release: .5});
  // And once more, after "with Laminar".
  const button = cues.voice.at(-1) ? Math.max(logo + 1.2, cues.voice.at(-1)!.at + cues.voice.at(-1)!.duration) : logo + 1.4;
  if (button < end - .3) slam(button, 1.2, chordAt(plan, logo), Math.max(.4, end - button - .1));
}
