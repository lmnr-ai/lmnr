import type {ScoreCues} from '../cues';
import {VIBE, brush, chordAt, eachChord, modal, pulse, toneOf, voiceBed, voiceGaps, type Chord} from '../rounded';
import {rim} from '../lofi/instruments';
import {kick, piano, snare, type Mix, type Route} from '../voices';
import {cymbal, cymbalSwell, horn, section, tom, upright} from './instruments';

/*
 * Bluenote — a swinging jazz date at 152 BPM. A brushed piano trio in F with vibes answers the voice
 * through Ultimate2. The failure is a stabbed tritone chord and a stop-time. Cost turns to
 * sticks and D minor, and the budget dies on a plunger trombone. "Until now." is a drum fill into a
 * big-band shout chorus in A♭ for Flow-1. The logo is a Basie ending: plink, plink, and the band.
 */

export const BEAT = 60 / 152;
const BAR = BEAT * 4, SWING = .64;
const KEYS: Route = {bus: 'music', room: .35, hall: .12};
const BASS: Route = {bus: 'music', room: .2};
const KIT: Route = {bus: 'music', room: .4, hall: .06};
const HORNS: Route = {bus: 'music', room: .45, hall: .2};
const VIBES: Route = {bus: 'music', room: .3, hall: .25, delay: .08};

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
// Rootless left-hand voicings; the bass supplies the root.
const F69 = v(41, 57, 60, 62, 67), FMAJ9 = v(41, 57, 60, 64, 67), D7ALT = v(38, 54, 58, 60, 63), GM9 = v(43, 53, 57, 58, 62), C13 = v(36, 52, 57, 58, 62);
const GB13 = v(42, 52, 58, 60, 63), BBM6 = v(46, 53, 55, 58, 61), C7SUS = v(36, 53, 55, 58, 62), C7ALT = v(36, 52, 56, 58, 63);
const DM9 = v(38, 53, 57, 60, 64), G13 = v(43, 53, 57, 59, 64), DB7 = v(37, 53, 55, 59, 63), BB_C = v(36, 53, 58, 62, 65);
const DM6 = v(38, 53, 57, 59, 62), A7ALT = v(45, 55, 60, 61, 65), BBMAJ = v(34, 57, 60, 62, 64), E7ALT = v(40, 56, 60, 62, 67);
const DM_C = v(36, 53, 57, 62, 65), BM7B5 = v(35, 53, 57, 59, 62), EB13 = v(39, 55, 60, 61, 65);
const ABMAJ9 = v(44, 55, 58, 60, 63), F7ALT = v(41, 57, 60, 63, 68), BBM9 = v(46, 56, 60, 61, 65), DBMAJ9 = v(37, 53, 56, 60, 63);
const CM7 = v(36, 51, 55, 58, 62), EB7SUS = v(39, 56, 58, 61, 65), AB69 = v(44, 58, 60, 63, 65);

export function bluenotePlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues, {prelude} = issues;
  const bars = pulse(flow.reveal, BAR);
  const c = (at: number, voicing: Voicing): Chord => ({at, ...voicing});
  /** One chord per bar from `from` to `to`, cycling `loop`; the first lands on `from` itself. */
  const loop = (from: number, to: number, cycle: readonly Voicing[]) =>
    [c(from, cycle[0]), ...bars.steps(from + BEAT * 1.5, to).map((step, i) => c(step.time, cycle[(i + 1) % cycle.length]))];
  return [
    c(0, F69), ...loop(u2.stream.at, u2.failure, [FMAJ9, D7ALT, GM9, C13]),
    c(u2.failure, GB13), c(u2.backtrack.at, BBM6), c(u2.highlight.at - .6, C7SUS), c(u2.warning, C7ALT),
    ...loop(u2.insights, u2.cloudIn.at, [FMAJ9, DM9, GM9, C13, FMAJ9, DM9, G13, C13]), c(u2.cloudIn.at, DB7), c(u2.ifOnly, BB_C),
    ...loop(cost.cloudOut.at, cost.thinkingDrop.at, [DM6, A7ALT]), c(cost.thinkingDrop.at, E7ALT), c(cost.cameraToBash.at, A7ALT),
    c(cost.bashStop, BBMAJ), c(cost.bashWarning, E7ALT), c(cost.cameraToBudget.at, A7ALT), c(cost.budgetRun.at, DM_C),
    c(cost.depletion.at, BM7B5), c(cost.depletion.at + .9, BBMAJ), c(cost.depletion.at + 1.7, A7ALT), c(flow.reveal - BAR * .9, EB13),
    ...loop(flow.reveal, flow.cameraToEngine.at, [ABMAJ9, F7ALT, BBM9, EB13]), c(flow.cameraToEngine.at, DBMAJ9), c(flow.cover.at, EB7SUS),
    ...loop(issues.leadIn.at, prelude.zoomOut.at, [ABMAJ9, CM7, BBM9, EB13]), c(prelude.zoomOut.at, DBMAJ9), c(prelude.circleGrow.at, EB7SUS),
    ...loop(issues.native, conclusion.start, [ABMAJ9, F7ALT, BBM9, EB13]),
    c(conclusion.start, DBMAJ9), c(conclusion.start + BAR, CM7), c(conclusion.start + BAR * 1.75, BBM9), c(conclusion.logo - BAR * .6, EB7SUS), c(conclusion.logo, AB69),
  ].sort((a, b) => a.at - b.at);
}

/** Where the band is and how hard it plays. */
type Feel = {from: number; to: number; level: number; brushes?: boolean; walk?: boolean; comp?: number; bombs?: boolean};

export function composeBluenote(mix: Mix, cues: ScoreCues) {
  const plan = bluenotePlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const grid = pulse(flow.reveal, BEAT);
  const swing = (time: number) => time + SWING * BEAT;
  const beatOf = (index: number) => ((Math.round(index) % 4) + 4096) % 4;
  voiceBed(mix, cues, .72);

  const feels: Feel[] = [
    {from: u2.firstThinking.at, to: u2.failure, level: .7, brushes: true, walk: true, comp: .5},
    {from: u2.backtrack.at, to: u2.cloudIn.at, level: .7, brushes: true, walk: true, comp: .5},
    {from: u2.cloudIn.at, to: cost.cloudOut.at, level: .55, brushes: true, comp: .3},
    {from: cost.cloudOut.at, to: cost.bashStop, level: .85, walk: true, comp: .7},
    {from: cost.bashStop, to: cost.depletion.at, level: 1, walk: true, comp: .8, bombs: true},
    {from: cost.depletion.at, to: cost.depletion.at + 1.6, level: .5, comp: 0},
    {from: flow.reveal, to: flow.cover.at, level: 1.15, walk: true, comp: 1, bombs: true},
    {from: flow.coverShut, to: issues.prelude.zoomOut.at, level: .75, walk: true, comp: .5},
    {from: issues.prelude.zoomOut.at, to: issues.native, level: .7, brushes: true, comp: .4},
    {from: issues.native, to: conclusion.start, level: 1.05, walk: true, comp: .9, bombs: true},
    {from: conclusion.start, to: conclusion.logo - BAR * .6, level: 1.1, walk: true, comp: .9, bombs: true},
  ];

  // The kit: ride "ding, ding-a ding", hat on 2 and 4, feathered kick, brushes or stick comping.
  for (const feel of feels) for (const {time, index} of grid.steps(feel.from, feel.to)) {
    const beat = beatOf(index), level = feel.level, pan = .25;
    cymbal(mix, time, 'ride', (beat % 2 ? .45 : .6) * level, {...KIT, pan});
    if (beat % 2) { cymbal(mix, swing(time), 'ride', .35 * level, {...KIT, pan}); cymbal(mix, time, 'hat', .45 * level, {...KIT, pan: -.3}, {decay: .03}); }
    kick(mix, time, .12 * level, KIT);
    if (feel.brushes) {
      brush(mix, time, .3 * level, {...KIT, pan: -.1}, {length: BEAT * 1.1, hz: 2400, attack: BEAT * .5});
      if (beat % 2) brush(mix, time, .5 * level, {...KIT, pan: -.1}, {length: .14, hz: 3200, attack: .003});
    } else {
      if (mix.random() < .3) snare(mix, swing(time), (.12 + .12 * mix.random()) * level, {...KIT, pan: -.15}, .5);
      if (beat === 3 && mix.random() < .35) snare(mix, swing(time), .4 * level, {...KIT, pan: -.15}, .6);
    }
    if (feel.bombs && beat === 3 && mix.random() < .4) kick(mix, swing(time), .55 * level, KIT);
  }

  // Walking bass: root on one, chord tones through the bar, a chromatic step into the next chord.
  const fold = (midi: number) => { while (midi > 45) midi -= 12; while (midi < 31) midi += 12; return midi; };
  for (const feel of feels) for (const {time, index} of grid.steps(feel.from, feel.to)) {
    const beat = beatOf(index), chord = chordAt(plan, time), next = chordAt(plan, time + BEAT * 1.02);
    if (!feel.walk && beat % 2) continue;
    const root = fold(chord.bass);
    let note = root;
    if (next !== chord || beat === 3) note = fold(next.bass) + (mix.random() < .5 ? 1 : -1);
    else if (beat) note = toneOf(chord, [0, 1, 2, 1][beat] + (Math.floor(index / 4) % 2), root);
    upright(mix, time, note, (beat ? .7 : .85) * Math.min(1, feel.level + .2), BASS, feel.walk ? BEAT * 1.05 : BEAT * 2.1);
  }

  // Piano comping: Charleston hits on the voicing, pushed into the next chord when it changes.
  const comp = (time: number, chord: Chord, velocity: number, length = .3) =>
    chord.pad.forEach((midi, i) => piano(mix, time + i * .006, midi, velocity * (i === chord.pad.length - 1 ? 1 : .85), KEYS, {length, bright: .55}));
  for (const feel of feels) if (feel.comp) for (const {time, index} of grid.steps(feel.from, feel.to)) {
    const beat = beatOf(index), next = chordAt(plan, time + BEAT * 1.02);
    if (beat === 0 && mix.random() < .7) comp(time, chordAt(plan, time), .42 * feel.comp);
    if (beat === 1 && mix.random() < .8) comp(swing(time), chordAt(plan, time), .36 * feel.comp, .22);
    if (beat === 3 && next !== chordAt(plan, time)) comp(swing(time), next, .45 * feel.comp, .5);
  }

  // Opening: a rolled F6/9 as the agent appears.
  eachChord(plan, 0, .01, chord => chord.pad.forEach((midi, i) => piano(mix, .02 + i * .045, midi + 12, .45, KEYS, {length: 3})));
  upright(mix, .02, 29, .8, BASS, 2.5);

  // Failure: the band stabs the tritone chord and stops dead; only the bass pedals under "the trace can tell you why".
  cymbal(mix, u2.failure, 'crash', .8, {...KIT, pan: .35}, {decay: 1.8});
  kick(mix, u2.failure, .8, KIT);
  comp(u2.failure, chordAt(plan, u2.failure), .75, 1.2);
  piano(mix, u2.failure, 30, .7, KEYS, {length: 1.8});
  for (const {time} of grid.steps(u2.failure + BEAT, u2.backtrack.at)) upright(mix, time, 30, .55, BASS, BEAT);

  // Cost, the powerful model: drum bombs and the low end of the piano.
  kick(mix, cost.bashStop, 1, KIT); cymbal(mix, cost.bashStop, 'crash', .75, {...KIT, pan: -.3});
  [22, 34].forEach(midi => piano(mix, cost.bashStop, midi, .8, KEYS, {length: 2}));

  // "Until now.": the band is gone; a snare roll swells into a tom fill and the downbeat.
  const fillStart = flow.reveal - BAR * .5;
  for (let t = cost.depletion.at + 1.8, gap = .09; t < fillStart; t += gap) snare(mix, t, .08 + .25 * ((t - cost.depletion.at - 1.8) / (fillStart - cost.depletion.at - 1.8)), {...KIT, pan: -.15}, .7);
  [0, 1, 2, 3, 4, 5].forEach(i => tom(mix, fillStart + i * BEAT / 3, [52, 50, 47, 45, 43, 40][i], .65 + i * .05, {...KIT, pan: .4 - i * .16}));
  cymbalSwell(mix, flow.reveal - BAR, flow.reveal, .45, {...KIT, pan: .3}, {ring: .2});

  // Flow-1: the shout chorus. A ripped A♭ chord on the downbeat, then section hits on the pushes.
  kick(mix, flow.reveal, .8, KIT); cymbal(mix, flow.reveal, 'crash', .8, {...KIT, pan: .35}, {decay: 2.5}); cymbal(mix, flow.reveal + .01, 'crash', .7, {...KIT, pan: -.4}, {decay: 2});
  const shout = (chord: Chord) => chord.pad.map(midi => midi + 12);
  section(mix, flow.reveal, shout(chordAt(plan, flow.reveal)), BAR * .9, .75, HORNS, {rip: 4, swell: .3});
  const hits = (from: number, to: number, level: number) => {
    for (const {time, index} of grid.steps(from, to)) {
      const beat = beatOf(index), chord = chordAt(plan, time), next = chordAt(plan, time + BEAT * 1.02);
      if (beat === 3 && next !== chord) {
        section(mix, swing(time), shout(next), BEAT * 1.2, .7 * level, HORNS, {scoop: .8});
        cymbal(mix, swing(time), 'crash', .35 * level, {...KIT, pan: .35}, {decay: 1});
        kick(mix, swing(time), .5 * level, KIT);
      } else if (beat === 1 && mix.random() < .5) section(mix, swing(time), shout(chord), .12, .5 * level, HORNS, {});
    }
  };
  hits(flow.reveal + BAR, flow.cover.at, 1);
  hits(issues.native + BAR, conclusion.logo - BAR, .9);
  section(mix, flow.cameraToEngine.at, shout(chordAt(plan, flow.cameraToEngine.at)), BAR * .7, .75, HORNS, {swell: .4, fall: 5});
  section(mix, flow.coverShut, shout(chordAt(plan, flow.coverShut)), .25, .85, HORNS, {fall: 7});
  kick(mix, flow.coverShut, .8, KIT); cymbal(mix, flow.coverShut, 'crash', .6, {...KIT, pan: .3}, {decay: 1.2});

  // Answers in the pauses: a bebop lick on vibes before the drop, on the trumpet after it.
  const LICK = [[0, 4, 1], [.5, 3, .8], [1, 2, .8], [1.5, 1, .8], [2, 3, .9], [2.5, 5, 1], [3, 4, 1.4]] as const;
  for (const gap of voiceGaps(cues, .75)) {
    if (gap.at < .3 || (gap.at > cost.depletion.at - .5 && gap.at < flow.reveal + .5) || gap.at > conclusion.logo - 1.5) continue;
    const start = grid.steps(gap.at + .05, gap.at + gap.duration)[0]?.time;
    if (start === undefined) continue;
    const room = gap.at + gap.duration - start, trumpet = start > flow.reveal;
    for (const [beats, index, hold] of LICK) {
      const at = beats % 1 ? swing(start + Math.floor(beats) * BEAT) : start + beats * BEAT;
      if (at > start + room - .1) break;
      const midi = toneOf(chordAt(plan, at), index, trumpet ? 67 : 72), duration = BEAT * hold * .5;
      if (trumpet) horn(mix, at, midi, duration, .65, {...HORNS, pan: .15}, {kind: 'trumpet', scoop: .4, fall: index === 4 && hold > 1 ? 3 : 0});
      else modal(mix, at, midi, .7, {...VIBES, pan: .2}, VIBE, {mallet: 3200, malletLevel: .3, name: 'vibes'});
    }
  }

  // Conclusion: the band builds a turnaround, then the Basie ending around "with Laminar".
  cymbalSwell(mix, conclusion.logo - BAR, conclusion.logo - .75, .3, {...KIT, pan: .3}, {ring: .3});
  const plinks = [conclusion.logo - .7, conclusion.logo - .42];
  plinks.forEach((time, i) => piano(mix, time, [87, 84][i], .55, KEYS, {length: .4, bright: .8}));
  const logo = conclusion.logo, button = logo + 1.45;
  section(mix, logo, shout(chordAt(plan, logo)), 1.2, .55, HORNS, {swell: -.3});
  comp(logo, chordAt(plan, logo), .45, 1.6);
  upright(mix, logo, 32, .8, BASS, 1.6);
  cymbal(mix, logo, 'ride', .5, {...KIT, pan: .25}, {decay: 1.4});
  // The button, once the brand name has been said.
  section(mix, button, [60, 63, 67, 70, 75], .5, .8, HORNS, {fall: 6});
  [44, 56, 60, 63, 67, 72].forEach((midi, i) => piano(mix, button + i * .004, midi, .6, KEYS, {length: 1.6}));
  upright(mix, button, 32, .9, BASS, 1); kick(mix, button, .8, KIT);
  cymbal(mix, button, 'crash', .9, {...KIT, pan: .3}, {decay: 1.6}); snare(mix, button, .7, KIT, .7);
  rim(mix, button - BEAT * .5, .4, KIT);
}
