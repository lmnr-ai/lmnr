import type {ScoreCues} from '../cues';
import {chordAt, pulse} from '../rounded';
import {note} from '../tempesta/instruments';
import type {Mix, Route} from '../voices';
import {humanize} from '../writing';
import {dawnPlan} from './dawn';
import {composePrimaveraFelt, designPrimaveraFelt} from './felt';

/*
 * Primavera sun — primavera-felt with daylight in it. A soft, low celli motor in eighths runs under the
 * whole film: root and octave in a 3+3+2 accent, below the speech band so the voice keeps 300 Hz and up.
 * In the problem half the chords change every bar and the pads are bowed quicker and brighter, but the
 * motor only has root and octave, so the tension stays. It drives into "Until now.", stops dead with the
 * E7, rests for the reveal's first bar, and comes back with the fifth for the answer. It grows each
 * chapter and runs straight eighths into the logo.
 */

const BEAT = 60 / 120, BAR = BEAT * 4;
// Drier than the pads, or the pulse turns back into wash.
const MOTOR: Route = {bus: 'music', hall: .25, room: .06};
const ACCENTS = new Set([0, 3, 6]);

export function composePrimaveraSun(mix: Mix, cues: ScoreCues) {
  composePrimaveraFelt(mix, cues, {motor: true});
  const plan = dawnPlan(cues, {motor: true}), {flow, issues, conclusion} = cues;
  const reveal = flow.reveal, logo = conclusion.logo, suspend = reveal - BAR * .75, eighths = pulse(reveal, BEAT / 2);
  let count = 0;
  // ~6 dB under the rest of the music; the zoom-out's loud layer needs ~3 dB less level for the same place.
  const play = (time: number, midi: number, length: number, velocity: number, pan: number) => {
    const [at, v] = humanize(mix, time, velocity), level = time >= conclusion.start - .01 ? .75 : 1.1;
    note(mix, at, midi, length, v, {...MOTOR, pan}, {section: 'celli', bright: .3, level, offset: .04 + .03 * (count++ % 3)});
  };

  /** The 3+3+2 cell over each chord's root; `fifths` swaps the listed cell positions for the fifth. */
  const cell = (from: number, to: number, length: number, velocity: (time: number) => [number, number], {fifths = [] as number[], sparse = 0} = {}) => {
    for (const {time, index} of eighths.steps(from, to)) {
      const k = ((Math.round(index * 2) % 8) + 8) % 8, accent = ACCENTS.has(k);
      if (time < sparse && !accent) continue;
      const bass = chordAt(plan, time + .001).bass, root = bass < 40 ? bass + 12 : bass;
      const midi = fifths.includes(k) ? root + 7 : [0, 3, 6].includes(k) ? root : root + 12;
      const [soft, loud] = velocity(time);
      play(time, midi, length, accent ? loud : soft, midi === root ? -.15 : .15);
    }
  };
  const ramp = (from: number, to: number, a: [number, number], b: [number, number]) => (time: number): [number, number] => {
    const p = Math.min(1, Math.max(0, (time - from) / (to - from)));
    return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
  };

  // The problem half: two bars of accents only, then the full cell.
  const start = pulse(reveal, BAR).steps(0, BAR)[0]?.time ?? 0;
  cell(start, suspend, .22, () => [.2, .28], {sparse: start + BAR * 2});
  // "Until now.": straight eighths on the E pedal, swelling, cut dead with the E7.
  for (const {time, index} of eighths.steps(suspend, reveal - BEAT * .75)) {
    const p = (time - suspend) / (reveal - BEAT * .75 - suspend);
    play(time, Math.round(index * 2) % 2 ? 52 : 40, .2, .28 + .17 * p, Math.round(index * 2) % 2 ? .15 : -.15);
  }

  // The answer: a bar's rest for "Introducing Flow-1", then the cell with the fifth, growing each chapter.
  const back = reveal + BAR;
  cell(back, issues.leadIn.at, .18, ramp(back, flow.coverShut, [.2, .28], [.23, .32]), {fifths: [5], sparse: back + BAR});
  cell(issues.leadIn.at, issues.native, .18, () => [.24, .34], {fifths: [5]});
  cell(issues.native, conclusion.start, .18, () => [.26, .38], {fifths: [5, 7]});
  cell(conclusion.start, logo - BAR * .5, .18, ramp(conclusion.start, logo, [.3, .44], [.34, .5]), {fifths: [5, 7]});
  // Into the logo: straight eighths on the V7, all accented, with the timpani roll.
  for (const {time} of eighths.steps(logo - BAR * .5, logo - .05)) {
    const p = (time - (logo - BAR * .5)) / (BAR * .5), root = chordAt(plan, time + .001).bass;
    play(time, count % 2 ? root + 12 : root, .18, .44 + .06 * p, count % 2 ? .15 : -.15);
  }
  play(logo, 45, 1.5, .45, 0);
}

export const designPrimaveraSun = (mix: Mix, cues: ScoreCues) => designPrimaveraFelt(mix, cues, {motor: true});
