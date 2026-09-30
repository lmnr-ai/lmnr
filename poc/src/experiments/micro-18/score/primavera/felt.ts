import type {ScoreCues} from '../cues';
import {chordAt, pulse, radialPops, speaking, toneOf, type Chord} from '../rounded';
import {bowed, piano, type Mix, type Route} from '../voices';
import {composePrimaveraDawn, dawnPlan} from './dawn';
import {hash} from './ambient';

/*
 * Primavera felt — primavera-dawn with every pizzicato replaced by a soft felt piano, a third as
 * often. The piano's rounder attack rings into the string bed instead of ticking over it. The
 * clock-like gestures are gone rather than replaced: the trace-block plucks, the budget tick, the
 * "Until now." eighths and the radial pops. The reveal and the logo land on rolled piano chords,
 * and the zoom-out gets a legato broken-chord wash.
 */

const BEAT = 60 / 120, BAR = BEAT * 4;
const PIANO: Route = {bus: 'music', gain: .5, hall: .65, room: .04};
const WASH: Route = {...PIANO, hall: .7};
const FX: Route = {bus: 'sfx', gain: .5, hall: .6, room: .05};
const SOLO: Route = {bus: 'music', hall: .6, room: .05, pan: .12};
const BRIGHT = .45;

const key = (mix: Mix, time: number, midi: number, velocity: number, route: Route, length: number) =>
  piano(mix, time, midi, velocity, route, {length, bright: BRIGHT});

/** A rolled chord, bottom to top, `gap` apart, panned left to right. */
const rolled = (mix: Mix, time: number, notes: readonly number[], velocities: (k: number) => number, gap: number, length: number, gain = PIANO.gain) =>
  notes.forEach((midi, k) => key(mix, time + k * gap, midi, velocities(k), {...PIANO, gain, pan: -.3 + .6 * k / Math.max(1, notes.length - 1)}, length));

export function composePrimaveraFelt(mix: Mix, cues: ScoreCues) {
  composePrimaveraDawn(mix, cues, {pizzicato: false});
  const plan = dawnPlan(cues), {flow, conclusion} = cues, end = cues.duration;
  const reveal = flow.reveal, logo = conclusion.logo, suspend = reveal - BAR * .75;

  // Droplets: on the beat only, at least 1.5 s apart and never the same pitch twice.
  let last = -Infinity, previous = -1;
  for (const {time, index} of pulse(reveal, BEAT).steps(.5, suspend - .5, 1)) {
    if (time - last < 1.5 || hash(index) > (speaking(cues, time, .2) ? .12 : .3)) continue;
    const midi = toneOf(chordAt(plan, time + .001), Math.floor(hash(index + 17) * 5), 76);
    if (midi === previous) continue;
    key(mix, time, midi, .12 + .08 * hash(index + 9), {...PIANO, pan: hash(index + 3) - .5}, 3.5);
    last = time; previous = midi;
  }

  // "Until now.": a low E octave gives the dominant its weight.
  key(mix, suspend, 40, .3, PIANO, 3);
  key(mix, suspend, 52, .24, PIANO, 3);

  // The reveal: a rolled A major that finishes before "Introducing".
  rolled(mix, reveal, [45, 57, 64, 69, 73, 76], k => k ? .26 - .01 * (k - 1) : .34, .035, 5);

  // The zoom-out: legato eighths climbing each chord, swelling into the logo.
  const zoom = pulse(reveal, BEAT / 2).steps(conclusion.start, logo - .05);
  zoom.forEach(({time}, i) => {
    const chord = chordAt(plan, time + .001), p = (time - conclusion.start) / (logo - conclusion.start);
    key(mix, time, toneOf(chord, i % 6, 57), .14 + .1 * p, {...WASH, pan: -.35 + .7 * (i % 6) / 5}, 2);
  });

  // The logo: a wide rolled A major, then piano doubling the violins' E6 after the last word.
  // Ten notes stack into the loudest transient of the score, so the roll plays ~4 dB under the others.
  const final = chordAt(plan, logo + .001);
  rolled(mix, logo, [33, final.bass, ...final.pad, 85], k => k < 2 ? .4 : .3 - .04 * (k - 2) / 8, .03, 6, .3);
  const lastWord = cues.voice.at(-1), lift = lastWord ? lastWord.at + lastWord.duration + .07 : logo + 1.1;
  if (lift < end - 1) key(mix, lift, 88, .18, PIANO, 4);
}

/** The picture's in-key piano: dyads on the story beats, lifts on camera moves, never a clock. */
function feltKit(mix: Mix, cues: ScoreCues, plan: readonly Chord[]) {
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const note = (time: number, index: number, velocity: number, pan = 0, floor = 76, length = 2.5) => key(mix, time, tone(time, index, floor), velocity, {...FX, pan}, length);
  const dyad = (time: number, pan = 0) => { note(time, 0, .2, pan, 64, 3); note(time + .03, 2, .15, pan + .1, 76, 3); };
  const lift = (span: {at: number; duration: number}, up: boolean, velocity = .14, quiet = false) => [0, 1, 2].forEach(k => {
    const time = span.at + Math.max(.3, span.duration) * (.4 + k * .2), talking = speaking(cues, time, .1);
    if (!(quiet && talking)) note(time, up ? k + 1 : 3 - k, talking ? velocity * .7 : velocity, up ? -.3 + k * .3 : .3 - k * .3);
  });
  return {note, dyad, lift};
}

export function designPrimaveraFelt(mix: Mix, cues: ScoreCues) {
  const plan = dawnPlan(cues), {ultimate2: u2, cost, flow, issues} = cues, {note, dyad, lift} = feltKit(mix, cues, plan);
  dyad(u2.failure);
  lift(u2.backtrack, false);
  dyad(u2.warning, .2);
  lift(u2.zoom, false);
  lift(u2.cloudIn, true);

  lift(cost.cloudOut, false);
  dyad(cost.missIssues);
  for (let i = 0; i < 4; i++) note(cost.bashDescent.at + i * cost.bashDescent.duration * .85 / 4, 3 - i, .13, (i - 1.5) * .2, 71, 2);
  dyad(cost.bashWarning, .2);
  // The budget runs out on one held violin note that swells and stops dead at depletion.
  const budget = toneOf(chordAt(plan, cost.budgetRun.at + .001), 1, 71);
  bowed(mix, cost.budgetRun.at, cost.depletion.at, budget, SOLO, {section: 'violins', dynamics: [.12, .34], attack: .6, release: .15, level: .4, bright: .4});

  lift(flow.cameraZoom, true, .15, true);
  lift(flow.cameraToEngine, true, .15, true);
  // 47 radial pops become one rising roll across them.
  const pops = radialPops(cues);
  if (pops.length) [0, 1, 2, 3].forEach(k => {
    const pop = pops[Math.round(k * (pops.length - 1) / 3)];
    note(pop.at, k, .14, pop.pan);
  });
  lift(issues.travel, true, .15, true);
  note(issues.issueBadge, 2, .13, .3);
  note(issues.queryBadge, 3, .13, .3);
}
