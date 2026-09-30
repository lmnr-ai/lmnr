import type {ScoreCues} from '../cues';
import {blip, brush, chordAt, eachChord, glowPad, pulse, shimmer, softKick, sub, toneOf, voiceBed, voiceGaps, type Chord} from '../rounded';
import {bass, bell, reverseSwell, riser, type Mix, type Route} from '../voices';

/*
 * Lumen — A major, 120 BPM. The agent is a point of light, and its thinking is a sixteenth-note
 * arpeggio of soft sine blips that runs from the first frame. It stumbles at the failure,
 * reawakens on the insights, dims as the budget drains, and on Flow-1 it opens into a full
 * four-on-the-floor bloom of FM glass, sine bass and breathing pads.
 */

export const BEAT = .5;
const PAD: Route = {bus: 'music', hall: .55, room: .08};
const ARP: Route = {bus: 'music', room: .15, hall: .2, delay: .22};
const GLASS: Route = {bus: 'music', room: .2, hall: .4, delay: .2};
const LOW: Route = {bus: 'music', room: .08};
const KIT: Route = {bus: 'music', room: .15};

type Voicing = Omit<Chord, 'at'>;
const A: Voicing = {bass: 45, pad: [59, 61, 64, 68]};
const FSM: Voicing = {bass: 42, pad: [57, 61, 64, 68]};
const D: Voicing = {bass: 38, pad: [57, 61, 64, 66]};
const D_LYD: Voicing = {bass: 38, pad: [57, 61, 66, 68]};
const EG: Voicing = {bass: 44, pad: [59, 64, 66, 68]};
const BM: Voicing = {bass: 47, pad: [57, 61, 62, 66]};
const CSM: Voicing = {bass: 49, pad: [56, 59, 64, 68]};
const ESUS: Voicing = {bass: 40, pad: [59, 64, 66, 69]};

export function lumenPlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bar = pulse(flow.reveal, BEAT * 4).at;
  const c = (at: number, v: Voicing): Chord => ({at, ...v});
  return [
    c(0, A), c(u2.stream.at + 2, FSM), c(u2.stream.at + 4, D), c(u2.failure, BM), c(u2.backtrack.at, D_LYD),
    c(u2.warning, BM), c(u2.insights, D), c(u2.zoom.at + 1.5, EG), c(u2.cloudIn.at, ESUS),
    c(cost.cloudOut.at, CSM), c(cost.thinkingDrop.at, FSM), c(cost.bashStop, BM), c(cost.cameraToBudget.at, D),
    c(cost.depletion.at, BM), c(cost.depletion.at + cost.depletion.duration * .7, ESUS),
    c(flow.reveal, A), c(bar(1), EG), c(bar(2), FSM), c(bar(3), D), c(bar(4), A), c(bar(5), EG), c(bar(6), FSM), c(flow.cameraToEngine.at, ESUS),
    c(issues.prelude.bashEntry.at, BM), c(issues.prelude.bubble ?? issues.prelude.bashStop, D), c(issues.prelude.explanation?.at ?? issues.prelude.highlight, A),
    c(issues.prelude.zoomOut.at, FSM), c(issues.native, D), c(issues.native + 2, EG), c(issues.native + 4, A),
    c(issues.windowDown.at, FSM), c(issues.messageSend, D), c(conclusion.start, D), c(conclusion.start + 2, ESUS), c(conclusion.logo, A),
  ].sort((a, b) => a.at - b.at);
}

export function composeLumen(mix: Mix, cues: ScoreCues) {
  const plan = lumenPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues, end = cues.duration;
  const grid = pulse(flow.reveal, BEAT);
  voiceBed(mix, cues, .7);

  // The light: sine pads that breathe, a sine floor, and the glass dust above.
  eachChord(plan, 0, end, (chord, from, to) => {
    const dim = from >= cost.depletion.at && from < flow.reveal;
    glowPad(mix, from, to + .25, chord.pad, PAD, {attack: from < .1 ? 2 : .5, release: 1.4, level: dim ? .55 : .9, bright: from >= flow.reveal ? .6 : .35, breathe: .3});
    if (from > u2.stream.at) sub(mix, from, to, chord.bass - 12 >= 28 ? chord.bass - 12 : chord.bass, LOW, {level: from >= flow.reveal ? .35 : .5, attack: .2, release: .5});
  });
  shimmer(mix, u2.insights, u2.cloudIn.at + 1, [80, 83, 85, 88, 90], 2.5, {bus: 'music', hall: .7}, {level: .4});
  shimmer(mix, conclusion.start, end - .8, [80, 83, 85, 88, 92], 2.5, {bus: 'music', hall: .7}, {level: .45});

  // The arpeggio: which sixteenths sound, and how bright, in each part of the film.
  const arpShape = [0, 2, 4, 3, 1, 3, 5, 4];
  const density = (time: number) => {
    if (time < u2.stream.at) return time > u2.firstThinking.at ? 4 : 0;
    if (time < u2.failure) return 16;
    if (time < u2.insights) return 0;
    if (time < u2.cloudIn.at + 1) return 8;
    if (time < cost.cloudOut.at + 1) return 4;
    if (time < cost.depletion.at) return 8;
    if (time < cost.depletion.at + cost.depletion.duration) return 4 - 3 * (time - cost.depletion.at) / cost.depletion.duration;
    if (time < flow.reveal) return 0;
    if (time < issues.prelude.zoomOut.at) return 16;
    if (time < issues.native + BEAT * 4) return 4;
    if (time < conclusion.start) return 16;
    return time < conclusion.logo ? 4 : 0;
  };
  for (const {time, index} of grid.steps(0, end, 4)) {
    const sixteenth = Math.round(index * 4) + 4096, per = density(time);
    const every = per >= 16 ? 1 : per >= 8 ? 2 : per >= 4 ? 4 : per >= 2 ? 8 : 16;
    if (per <= 0 || sixteenth % every) continue;
    const chord = chordAt(plan, time), step = arpShape[sixteenth % 8] + (Math.floor(sixteenth / 8) % 2 ? 1 : 0);
    const falling = time > cost.depletion.at && time < flow.reveal ? -(time - cost.depletion.at) * 1.2 : 0;
    const accent = sixteenth % 4 === 0 ? 1 : .7;
    blip(mix, time, toneOf(chord, step, 69) + falling, .34 * accent, {...ARP, pan: sixteenth % 2 ? .3 : -.3}, {length: .09, bend: 0, warmth: .35, decay: .06});
  }

  // Stumble: the arp freezes on one note at the failure, stuttering down.
  for (let i = 0; i < 5; i++) blip(mix, u2.failure + i * .125 * (1 + i * .25), toneOf(chordAt(plan, u2.failure), 3, 69) - i, .3 - i * .05, ARP, {length: .1, bend: -1, decay: .07});

  // Flow-1: a reversed glass breath and a riser, then the bloom.
  riser(mix, flow.reveal - 2.2, flow.reveal, {bus: 'music', hall: .5}, {level: .25, fromMidi: 57, toMidi: 81});
  reverseSwell(mix, flow.reveal, 1.5, [69, 73, 76, 81], {bus: 'music', hall: .5});
  const groove = (from: number, to: number, level: number) => {
    for (const {time, index} of grid.steps(from, to, 2)) {
      const eighth = Math.round(index * 2), chord = chordAt(plan, time);
      if (eighth % 2 === 0) softKick(mix, time, .6 * level, KIT, 28);
      else brush(mix, time, .42 * level, {...KIT, pan: .2}, {length: .07, hz: 7200, attack: .002});
      if (eighth % 4 === 2) brush(mix, time, .4 * level, {...KIT, hall: .2}, {length: .2, hz: 2100, attack: .006});
      const bassNote = chord.bass - (chord.bass > 44 ? 12 : 0);
      if (eighth % 2 === 1) bass(mix, time, bassNote + (eighth % 8 === 7 ? 12 : 0), .2, .7 * level, LOW, {drive: 1.2});
    }
  };
  groove(flow.reveal, issues.prelude.zoomOut.at, 1);
  groove(issues.native + BEAT * 4, conclusion.start, .9);

  // A 1–5–3 bell call answers each pause in the narration.
  for (const gap of voiceGaps(cues, .9)) {
    if (gap.at < .3 || (gap.at >= flow.reveal - 2.5 && gap.at < flow.reveal + .5)) continue;
    const start = grid.steps(gap.at + .1, gap.at + gap.duration)[0]?.time;
    if (start === undefined || start > gap.at + gap.duration - .2) continue;
    [0, 2, 1].forEach((index, i) => {
      const time = start + i * BEAT * .75;
      bell(mix, time, toneOf(chordAt(plan, time), index + (i === 2 ? 3 : 0), 76), .5 - i * .06, {...GLASS, pan: -.25 + i * .25}, {decay: 1.6, ratio: 3.5, index: 1});
    });
  }

  // Logo: the arpeggio lets go into one bright A chord.
  const logo = conclusion.logo;
  glowPad(mix, logo, end, [57, 64, 69, 71, 73, 76], PAD, {attack: .15, release: 2.4, level: 1.3, bright: .7, breathe: .2});
  [69, 73, 76, 81, 85, 88].forEach((note, i) => bell(mix, logo + i * .05, note, .55 - i * .05, {...GLASS, pan: -.5 + i * .2}, {decay: 2.4, ratio: 3.5, index: 1.1}));
  sub(mix, logo, end - .2, 33, LOW, {level: .8, attack: .01, release: 1});
  softKick(mix, logo, .7, KIT, 28);
}
