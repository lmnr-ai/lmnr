import type {ScoreCues} from '../cues';
import {KALIMBA, MARIMBA, VIBE, air, brush, chordAt, eachChord, glowPad, modal, pulse, shimmer, softKick, string, sub, toneOf, voiceBed, voiceGaps, type Chord} from '../rounded';
import {reverseSwell, type Mix, type Route} from '../voices';

/*
 * Tidepool — F major, 96 BPM. A kalimba-and-marimba rock pool under warm sine pads. Until Flow-1
 * the bed has no beat: the agent's own stream blocks play the melody. The pulse arrives with the
 * cheap models, slows to a single note as the budget drains, and the whole groove lands on the
 * Flow-1 title. The motif C–F–G–A answers the narrator in its gaps and resolves on the logo.
 */

export const BEAT = .625;
const PAD: Route = {bus: 'music', hall: .5, room: .1};
const KEYS: Route = {bus: 'music', room: .25, hall: .22, delay: .1};
const LOW: Route = {bus: 'music', room: .12};
const KIT: Route = {bus: 'music', room: .2};

const F: Omit<Chord, 'at'> = {bass: 41, pad: [57, 60, 64, 67]};
const BB: Omit<Chord, 'at'> = {bass: 46, pad: [57, 60, 62, 65]};
const DM: Omit<Chord, 'at'> = {bass: 38, pad: [57, 60, 64, 65]};
const GM: Omit<Chord, 'at'> = {bass: 43, pad: [57, 58, 62, 65]};
const AM: Omit<Chord, 'at'> = {bass: 45, pad: [55, 60, 64, 67]};
const CE: Omit<Chord, 'at'> = {bass: 40, pad: [55, 60, 64, 67]};
const CSUS: Omit<Chord, 'at'> = {bass: 36, pad: [55, 60, 65, 67]};
const BB_LYD: Omit<Chord, 'at'> = {bass: 46, pad: [57, 62, 64, 65]};

/** The harmony both buses read: chords change on picture events before the drop, on bars after it. */
export function tidepoolPlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bar = pulse(flow.reveal, BEAT * 4).at;
  const chord = (at: number, c: Omit<Chord, 'at'>): Chord => ({at, ...c});
  return [
    chord(0, F), chord(u2.blocks[6]?.at ?? 4.4, BB),
    chord(u2.failure, DM), chord(u2.backtrack.at, BB_LYD), chord(u2.warning, GM),
    chord(u2.zoom.at, BB), chord(u2.zoom.at + u2.zoom.duration * .8, AM), chord(u2.cloudIn.at, CSUS),
    chord(cost.cloudOut.at, DM), chord(cost.thinkingDrop.at, BB), chord(cost.bashStop, GM),
    chord(cost.cameraToBudget.at, BB), chord(cost.depletion.at, GM), chord(cost.depletion.at + cost.depletion.duration * .75, CSUS),
    chord(flow.reveal, F), chord(bar(1), CE), chord(bar(2), DM), chord(bar(3), BB), chord(bar(4), F), chord(flow.cameraToEngine.at, CSUS),
    chord(issues.prelude.bashEntry.at, BB), chord(issues.prelude.bubble ?? issues.prelude.bashStop, CE), chord((issues.prelude.labels?.at ?? issues.prelude.highlight) + 1.2, DM), chord(issues.prelude.explanation?.at ?? issues.prelude.highlight, BB),
    chord(issues.prelude.zoomOut.at, GM), chord(issues.native, BB), chord(issues.travel.at + issues.travel.duration * .55, CE),
    chord(issues.windowDown.at, DM), chord(issues.messageSend, BB), chord(conclusion.start, BB), chord(conclusion.start + 2, CSUS),
    chord(conclusion.logo, F),
  ].sort((a, b) => a.at - b.at);
}

export function composeTidepool(mix: Mix, cues: ScoreCues) {
  const plan = tidepoolPlan(cues), {cost, flow, issues, conclusion} = cues;
  const beat = pulse(flow.reveal, BEAT);
  voiceBed(mix, cues, .72);
  const end = cues.duration;

  // Foundation: air, breathing pads and a sine floor under every chord.
  air(mix, 0, end, PAD, {level: .8, hz: 900});
  eachChord(plan, 0, end, (chord, from, to) => {
    const quiet = from >= cost.depletion.at + cost.depletion.duration * .75 && from < flow.reveal;
    glowPad(mix, from, to + .3, chord.pad, PAD, {attack: from === 0 ? 1.2 : .7, release: 1.6, level: quiet ? .5 : 1, bright: from >= flow.reveal ? .35 : .2});
    if (from > .5) sub(mix, from, to, chord.bass - 12 < 28 ? chord.bass : chord.bass - 12, LOW, {level: .55, attack: .25, release: .6});
  });
  // High glass shimmer thickens through the insights and returns for the clustering.
  const sparkle = (from: number, to: number, density: number) => shimmer(mix, from, to, [77, 79, 81, 84, 86, 88], density, {bus: 'music', hall: .7, delay: .2}, {level: .45});
  sparkle(cues.ultimate2.zoom.at, cues.ultimate2.cloudIn.at + 1, 2.2);
  sparkle(issues.prelude.zoomOut.at, issues.windowDown.at, 2.6);
  sparkle(conclusion.start, end - 1, 2);

  // Cost: a quiet marimba pulse for the cheap models, heavier octaves for the powerful one, then it slows away.
  for (const {time, index: beatIndex} of beat.steps(cost.cloudOut.at + 1, cost.depletion.at + cost.depletion.duration, 2)) {
    const index = beatIndex + 512;
    const slow = time > cost.depletion.at ? Math.floor((time - cost.depletion.at) / (cost.depletion.duration / 3)) : -1;
    const step = slow < 0 ? 1 : slow === 0 ? 2 : slow === 1 ? 4 : 8;
    if (Math.round(index * 2) % step) continue;
    const chord = chordAt(plan, time), heavy = time >= cost.bashStop && time < cost.cameraToBudget.at;
    if (heavy) { if (Number.isInteger(index) && Math.round(index) % 2 === 0) { modal(mix, time, chord.bass - 12, .7, LOW, MARIMBA, {mallet: 500}); modal(mix, time, chord.bass, .5, LOW, MARIMBA, {mallet: 700}); } continue; }
    modal(mix, time, toneOf(chord, Math.round(index * 2) % 4 === 0 ? 0 : 2 + Math.round(index * 2) % 3, 69), .32 + (Number.isInteger(index) ? .1 : 0), {...KEYS, pan: Math.round(index * 2) % 2 ? .35 : -.35}, MARIMBA, {mallet: 2600});
  }

  // Flow-1: breathe in, then the groove.
  reverseSwell(mix, flow.reveal, 1.6, [65, 69, 72, 76], {bus: 'music', hall: .5});
  const groove = (from: number, to: number, level: number) => {
    for (const {time, index} of beat.steps(from, to, 2)) {
      const eighth = Math.round(index * 2), inBar = eighth % 8, chord = chordAt(plan, time);
      if (inBar === 0 || inBar === 4) softKick(mix, time, .55 * level, KIT, 29);
      if (inBar === 2 || inBar === 6) brush(mix, time, .5 * level, {...KIT, pan: .1}, {length: .22, hz: 2600});
      brush(mix, time, (eighth % 2 ? .16 : .1) * level, {...KIT, pan: -.3}, {length: .06, hz: 6200, attack: .004});
      if (inBar === 0 || inBar === 3 || inBar === 6) string(mix, time, chord.bass - (chord.bass > 43 ? 12 : 0), .6 * level, LOW, {length: 1, damping: .994, bright: .25});
      // The kalimba arpeggio: chord tones climbing and falling over the bar.
      const shape = [0, 2, 3, 4, 5, 4, 3, 2][inBar];
      modal(mix, time, toneOf(chord, shape, 65), (.2 + (inBar % 2 ? 0 : .07)) * level, {...KEYS, pan: (inBar - 3.5) * .12}, KALIMBA, {mallet: 3000, malletLevel: .15});
    }
  };
  groove(flow.reveal, issues.prelude.zoomOut.at + .1, 1);
  groove(issues.native + BEAT * 2, conclusion.start, .85);

  // The motif answers the narrator wherever it pauses long enough to be heard.
  const motif = [0, 5, 7, 9], rhythm = [0, .5, 1, 1.5];
  for (const gap of voiceGaps(cues, 1)) {
    if (gap.at < .3 || (gap.at > flow.reveal - 2 && gap.at < flow.reveal)) continue;
    const start = beat.steps(gap.at + .15, gap.at + gap.duration)[0]?.time;
    if (start === undefined || start + 1 > gap.at + gap.duration + .3) continue;
    const chord = chordAt(plan, start), root = toneOf(chord, 0, 72) - 12 >= 65 ? toneOf(chord, 0, 60) + 12 : toneOf(chord, 0, 72);
    motif.forEach((interval, i) => {
      const time = start + rhythm[i] * BEAT;
      if (time > gap.at + gap.duration + .1) return;
      const note = toneOf(chordAt(plan, time), 0, root + interval);
      modal(mix, time, note, .38 - i * .03, {...KEYS, pan: .2, delay: .25}, VIBE, {mallet: 3500, malletLevel: .1});
    });
  }

  // Logo: F add9 blooms wide, the motif completes on A, then rests on F.
  const logo = conclusion.logo;
  glowPad(mix, logo, end, [53, 60, 65, 67, 69, 72], PAD, {attack: .2, release: 2.4, level: 1.2, bright: .4});
  [60, 65, 67, 69, 72, 77].forEach((note, i) => modal(mix, logo + i * .09, note, .5 - i * .04, {...KEYS, pan: -.4 + i * .16}, KALIMBA));
  modal(mix, logo + 1.1, 81, .3, {...KEYS, delay: .35}, VIBE);
  sub(mix, logo, end - .2, 29, LOW, {level: .8, attack: .02, release: 1});
}
