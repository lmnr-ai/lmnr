import type {ScoreCues} from '../cues';
import {chordAt, pulse, toneOf, type Chord} from '../rounded';
import {bowed, pizz, timpani, type Mix, type Route} from '../voices';
import {taiko} from '../overdrive/instruments';
import {drainLine, humanize} from '../writing';
import {E_MINOR, G_MAJOR, G_MINOR, note, roll, run, step, trill} from './instruments';

/*
 * Tempesta — a violin concerto played as if the building were on fire. Presto, 144 BPM, G minor in
 * the manner of Vivaldi's "Summer" storm and a Paganini caprice: the orchestra tremolos and hammers
 * celli eighths while the solo violin never stops running. The failure is a diminished-seventh tutti
 * and a scream, the insights climb a circle-of-fifths sequence into a Neapolitan hit on "If only",
 * "powerful" is the full orchestra at ffff, and the budget drains through the violin alone. "Until
 * now." is a trill over a timpani roll, one beat of silence, and a G major tutti drop. Issues goes to
 * E minor, climbs back, and the logo is a cadenza into the final hammer strokes.
 */

export const BEAT = 60 / 144;
const BAR = BEAT * 4, S16 = BEAT / 4;
const SOLO: Route = {bus: 'music', hall: .34, room: .08, pan: .08};
const VLN: Route = {bus: 'music', hall: .42, room: .05, pan: -.35};
const HIGH: Route = {bus: 'music', hall: .5, room: .04, pan: -.2};
const VC: Route = {bus: 'music', hall: .38, room: .06, pan: .35};
const DRUM: Route = {bus: 'music', hall: .45, room: .1};
const PLK: Route = {bus: 'music', hall: .35, room: .1};

type Voicing = Omit<Chord, 'at'>;
const v = (bass: number, ...pad: number[]): Voicing => ({bass, pad});
// G minor
const GM = v(31, 55, 58, 62, 67), CM = v(36, 55, 60, 63, 67), D7 = v(38, 54, 57, 60, 66), EB = v(39, 55, 58, 63, 67);
const F = v(41, 57, 60, 65, 69), BB = v(34, 58, 62, 65, 70), AM7B5 = v(33, 55, 60, 63, 67), DIM = v(37, 55, 58, 61, 64), AB = v(32, 56, 60, 63, 68);
// G major and E minor
const G = v(31, 55, 59, 62, 67), D = v(38, 54, 57, 62, 66), EM = v(40, 55, 59, 64, 67), C = v(36, 55, 60, 64, 67);
const B7 = v(35, 54, 57, 63, 66), AM = v(33, 57, 60, 64, 69), EBMAJ = v(39, 55, 58, 63, 67);

export function tempestaPlan(cues: ScoreCues): Chord[] {
  const {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const bars = pulse(flow.reveal, BAR);
  const c = (at: number, voicing: Voicing): Chord => ({at, ...voicing});
  const loop = (from: number, to: number, cycle: readonly Voicing[]) =>
    [c(from, cycle[0]), ...bars.steps(from + BEAT * 1.5, to - BEAT).map((s, i) => c(s.time, cycle[(i + 1) % cycle.length]))];
  const insightsEnd = u2.cloudIn.at + u2.cloudIn.duration * .7;
  return [
    ...loop(0, u2.failure, [GM, CM, D7, GM]), c(u2.failure, DIM), c(u2.backtrack.at, CM), c(u2.highlight.at, D7), c(u2.warning, DIM),
    ...loop(u2.insights, insightsEnd, [CM, F, BB, EB, AM7B5, D7, GM, D7]), c(u2.ifOnly, AB), c(cost.cloudOut.at - BAR, D7),
    ...loop(cost.cloudOut.at, cost.missIssues, [GM, D7]), c(cost.missIssues, DIM), c(cost.missIssues + BAR, D7),
    ...loop(cost.bashStop, cost.depletion.at, [GM, EB, CM, D7]), c(cost.depletion.at, GM), c(flow.entry.at - BAR * .5, D7),
    ...loop(flow.reveal, flow.coverShut, [G, D, EM, B7, C, G, AM, D]), c(flow.coverShut, EBMAJ),
    ...loop(issues.leadIn.at, issues.prelude.zoomOut.at, [EM, AM, B7, EM]), c(issues.prelude.zoomOut.at, C), c(issues.prelude.zoomOut.at + BAR, D7),
    ...loop(issues.native, conclusion.start, [G, EM, C, D]), c(conclusion.start, C), c(conclusion.start + BAR, D7),
    c(conclusion.logo, G),
  ].sort((a, b) => a.at - b.at);
}

/** The key under the bed at `time`; the foley shares it so its runs never step outside the harmony. */
export function tempestaScale(cues: ScoreCues, time: number) {
  const {flow, issues} = cues;
  if (time >= issues.leadIn.at && time < issues.prelude.zoomOut.at) return E_MINOR;
  // From the zoom out the plan climbs C → D7 → G, so the scale is already G major.
  return time >= flow.reveal - .01 && time < flow.coverShut || time >= issues.prelude.zoomOut.at - .01 ? G_MAJOR : G_MINOR;
}

type Figure = 'storm' | 'arp' | 'bariolage' | 'repeat' | 'double';

export function composeTempesta(mix: Mix, cues: ScoreCues) {
  const plan = tempestaPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues, end = cues.duration;
  const grid = pulse(flow.reveal, BEAT), bars = pulse(flow.reveal, BAR);
  const sixteenthOf = (index: number) => ((Math.round(index * 4) % 16) + 4096) % 16;
  const scaleAt = (time: number) => tempestaScale(cues, time);

  /** The whole orchestra on one chord: celli and basses, violins, the soloist, timpani, gran cassa. */
  const tutti = (time: number, size: number, chord = chordAt(plan, time), length = .5, ring = size > 1) => {
    // Past forte a hit gets longer and wider (a high violin octave), not peakier: the strings and drums stop growing.
    const dyn: [number, number] = [Math.min(1, .75 + .2 * size), .5], body = Math.min(1.2, size), drum = Math.min(1.1, size);
    bowed(mix, time, time + length, chord.bass, VC, {section: 'celli', dynamics: dyn, attack: .004, release: .5, level: .9 * body});
    bowed(mix, time, time + length, chord.bass + 12, VC, {section: 'celli', dynamics: dyn, attack: .004, release: .5, level: .7 * body});
    chord.pad.forEach((midi, i) => bowed(mix, time, time + length, midi, {...VLN, pan: -.45 + i * .2}, {section: 'violins', dynamics: dyn, attack: .004, release: .6, level: .5 * body, bright: .8}));
    bowed(mix, time, time + length, toneOf(chord, 0, 79), SOLO, {dynamics: dyn, attack: .004, release: .6, level: .7 * body, bright: .85});
    timpani(mix, time, chord.bass < 36 ? chord.bass + 12 : chord.bass, .6 * drum, DRUM, {decay: 1.2 + .5 * size});
    taiko(mix, time, .28 * drum, DRUM, .7);
    // No cymbals: the synthesized crash is filtered noise, which turns to grain in the hall.
    if (ring) bowed(mix, time, time + length + .3, toneOf(chord, 0, 88), {...HIGH, pan: .25}, {dynamics: [1, .4], attack: .004, release: .8, level: .45 * body, bright: .9});
  };
  /** Build into `to`: violins swell on tremolo, the soloist runs up, timpani roll. */
  const build = (from: number, to: number, level = 1, top = 91) => {
    const chord = chordAt(plan, from + .01);
    roll(mix, from, to - .02, chord.bass < 36 ? chord.bass + 12 : chord.bass, [.12 * level, .5 * level], DRUM);
    for (const midi of chord.pad.slice(-3)) for (let t = from; t < to - .03; t += S16 / 2)
      note(mix, t, midi, S16 * .45, .3 + .65 * ((t - from) / (to - from)) ** 1.5, {...VLN, pan: -.4 + (midi - 55) / 40}, {section: 'violins', offset: .08, level: .45 * level});
    const runFrom = Math.max(from, to - BAR);
    run(mix, runFrom, to - .02, step(scaleAt(runFrom), top - 24, 0), top, scaleAt(runFrom), [.55, 1], SOLO, {curve: 1.4, level: level});
  };

  /** The solo violin's 16th-note figure at step `s` of the bar over `chord`. */
  const figure = (kind: Figure, s: number, chord: Chord, scale: readonly number[]) => {
    switch (kind) {
    case 'storm': return step(scale, toneOf(chord, s < 8 ? 1 : 0, 84), -(s % 8));
    case 'arp': return toneOf(chord, [0, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1][s], 62);
    case 'bariolage': return s % 2 ? toneOf(chord, 0, 74) : toneOf(chord, [5, 4, 3, 2, 3, 4, 5, 6][s >> 1], 62);
    case 'repeat': return toneOf(chord, [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 3, 3, 2, 1][s], 67);
    case 'double': return toneOf(chord, [0, 2, 4, 6, 7, 6, 4, 2, 1, 3, 5, 7, 8, 7, 5, 3][s], 60);
    }
  };

  /** The engine room: which layers play from `from` to `to` and how hard (`level` can crescendo). */
  type Drive = {solo?: Figure; tremolo?: 16 | 32; chug?: 8 | 16; timp?: 'down' | 'beats' | 'drive'; cassa?: boolean; sustain?: boolean; pizz?: boolean; level?: number | [number, number]};
  const drive = (from: number, to: number, spec: Drive) => {
    const [l0, l1] = typeof spec.level === 'number' ? [spec.level, spec.level] : spec.level ?? [1, 1];
    const levelAt = (time: number) => l0 + (l1 - l0) * Math.min(1, Math.max(0, (time - from) / Math.max(.01, to - from)));
    for (const {time, index} of grid.steps(from, to, 4)) {
      const s = sixteenthOf(index), chord = chordAt(plan, time + .001), level = levelAt(time), accent = s % 4 === 0 ? 1 : .78;
      if (spec.solo) {
        const [at, velocity] = humanize(mix, time, (.62 + .3 * level) * accent);
        const midi = figure(spec.solo, s, chord, scaleAt(time));
        note(mix, at, midi, S16 * .95, velocity, {...SOLO, pan: .02 + .12 * ((midi - 62) / 30)}, {level: .9});
        if (spec.solo === 'double' && s % 2 === 0) note(mix, at + .003, toneOf(chord, 0, midi - 9), S16 * 1.6, velocity * .8, SOLO, {level: .6});
      }
      if (spec.tremolo) for (const [i, midi] of chord.pad.slice(-3).entries()) {
        for (let k = 0; k < spec.tremolo / 16; k++) note(mix, time + k * S16 / 2 + i * .002, midi, S16 * (spec.tremolo === 32 ? .45 : .8), (.35 + .55 * level) * (k ? .85 : accent), {...VLN, pan: -.5 + i * .25}, {section: 'violins', offset: .08, level: .42 * level});
      }
      if (spec.chug === 8 && s % 2 === 0) {
        const octave = s % 4 === 2 ? 12 : 0;
        note(mix, time, chord.bass + octave, S16 * 1.5, (.55 + .4 * level) * accent, VC, {section: 'celli', level: .85 * level});
        if (!octave) note(mix, time + .003, chord.bass + 12, S16 * 1.5, (.5 + .4 * level) * accent, {...VC, pan: .25}, {section: 'celli', level: .55 * level});
      }
      if (spec.chug === 16) {
        const offset = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 0][s];
        note(mix, time, chord.bass + 12 + offset, S16 * .85, (.6 + .4 * level) * accent, VC, {section: 'celli', level: .8 * level, bright: .8});
        if (s % 4 === 0) note(mix, time + .003, chord.bass, S16 * 2, .9 * level, {...VC, pan: .45}, {section: 'celli', level: .8 * level});
      }
      const timpMidi = chord.bass < 36 ? chord.bass + 12 : chord.bass;
      if ((spec.timp === 'down' && s === 0) || (spec.timp === 'beats' && s % 4 === 0) || (spec.timp === 'drive' && [0, 4, 8, 12, 14, 15].includes(s)))
        timpani(mix, time, s % 8 === 4 ? timpMidi - 5 : timpMidi, (s === 0 ? .6 : .42) * level, {...DRUM, pan: s % 8 === 4 ? .2 : -.1}, {decay: .6});
      if (spec.cassa && s === 0) taiko(mix, time, .3 * level, DRUM, .7);
      if (spec.pizz && s % 2 === 0) pizz(mix, time, toneOf(chord, [0, 2, 1, 3, 2, 4, 3, 1][s >> 1], 67), .45 * level * accent, {...PLK, pan: -.3 + .1 * (s >> 1)}, {length: .5});
    }
    if (spec.sustain) for (const {time} of bars.steps(from, to - BEAT)) {
      const chord = chordAt(plan, time + .001), until = Math.min(to, time + BAR) + .04;
      chord.pad.slice(-2).forEach((midi, i) => bowed(mix, time, until, midi + 12, {...HIGH, pan: -.3 + i * .3}, {dynamics: [.5 * levelAt(time), .65 * levelAt(time)], attack: .12, release: .3, level: .55, bright: .7}));
    }
  };

  // ------------------------------------------------ Ultimate2: the storm breaks at once.
  tutti(0, 1, chordAt(plan, 0), .9, true);
  drive(u2.firstThinking.at, u2.stream.at, {solo: 'repeat', tremolo: 16, chug: 8, timp: 'down', level: [.55, .7]});
  drive(u2.stream.at, u2.failure - BEAT, {solo: 'storm', tremolo: 32, chug: 8, timp: 'beats', level: [.6, .95]});
  build(u2.failure - BAR, u2.failure, .9, 94);
  // The failure: a diminished seventh, a scream at the top of the fingerboard, and the orchestra gone.
  tutti(u2.failure, 1.2, chordAt(plan, u2.failure), .7, true);
  bowed(mix, u2.failure, u2.failure + 1, 94, SOLO, {dynamics: [1, .3], attack: .004, release: .5, level: 1});
  run(mix, u2.failure + .9, u2.upwardTurn.at + u2.upwardTurn.duration, 91, 67, G_MINOR, [.6, .3], SOLO, {curve: .8});
  // The trace can tell you why: the pizzicato rewinds, celli tremolo pianissimo, a timpani heartbeat.
  [93, 88, 84, 81, 76, 72, 69, 67, 64, 60].forEach((midi, i) => pizz(mix, u2.backtrack.at + i * .05, midi, .6 - i * .03, {...PLK, pan: .4 - i * .08}));
  for (let t = u2.backtrack.at + .3; t < u2.warning - .1; t += S16 / 2) note(mix, t, chordAt(plan, t).bass + 12, S16 * .45, .45, VC, {section: 'celli', offset: .1, level: .45});
  for (const {time} of grid.steps(u2.backtrack.at + .3, u2.warning, 1)) timpani(mix, time, 43, .3, DRUM, {decay: .5});
  u2.drawers.forEach((time, i) => pizz(mix, time, [72, 75, 79][i], .7, {...PLK, pan: -.3 + i * .3}));
  bowed(mix, u2.highlight.at, u2.warning, 90, SOLO, {dynamics: [.3, .8], attack: .2, release: .1, level: .8});
  tutti(u2.warning, .9, chordAt(plan, u2.warning), .4);
  // The insights: a Vivaldi sequence round the circle of fifths, louder every bar.
  const insightsEnd = u2.cloudIn.at + u2.cloudIn.duration * .7;
  drive(u2.warning + BEAT, u2.insights, {tremolo: 32, level: .6});
  tutti(u2.insights, .8, chordAt(plan, u2.insights), .35, false);
  drive(u2.insights, insightsEnd - BAR * 1.5, {solo: 'arp', tremolo: 16, chug: 8, timp: 'down', sustain: true, level: [.55, .85]});
  drive(insightsEnd - BAR * 1.5, u2.ifOnly - BEAT, {solo: 'storm', tremolo: 32, chug: 16, timp: 'drive', cassa: true, level: [.85, 1]});
  build(u2.ifOnly - BAR * 1.25, u2.ifOnly, 1.1, 96);
  // "If only": a Neapolitan A♭ hit, then the question hangs on a high violin over celli tremolo.
  tutti(u2.ifOnly, 1.25, chordAt(plan, u2.ifOnly), 1.2, true);
  bowed(mix, u2.ifOnly + .6, cost.cloudOut.at - BAR, 92, SOLO, {dynamics: [.5, .35], attack: .5, release: .6, level: .75});
  for (let t = u2.ifOnly + .6; t < cost.cloudOut.at - BAR; t += S16 / 2) note(mix, t, 44, S16 * .45, .4, VC, {section: 'celli', offset: .1, level: .4});
  drive(cost.cloudOut.at - BAR, cost.cloudOut.at, {tremolo: 32, level: [.4, 1]});
  roll(mix, cost.cloudOut.at - BAR, cost.cloudOut.at - .02, 38, [.1, .75], DRUM);
  run(mix, cost.cloudOut.at - BEAT * 2, cost.cloudOut.at - .02, 62, 86, G_MINOR, [.5, 1], SOLO, {curve: 1.3});

  // ------------------------------------------------ Cost: brilliance, a stumble, then the full weight.
  tutti(cost.cloudOut.at, 1, chordAt(plan, cost.cloudOut.at), .4, true);
  drive(cost.cloudOut.at, cost.missIssues, {solo: 'bariolage', pizz: true, chug: 8, timp: 'down', level: .8});
  // Cheap models trip: the run slips chromatically onto a diminished seventh.
  [0, 1, 2, 3, 4, 5].forEach(i => note(mix, cost.missIssues - .3 + i * .05, 86 - i, .08, .8, SOLO));
  tutti(cost.missIssues, .9, chordAt(plan, cost.missIssues), .5);
  drive(cost.missIssues + BEAT, cost.bashStop - BAR, {tremolo: 32, chug: 8, timp: 'beats', level: [.5, .8]});
  build(cost.bashStop - BAR, cost.bashStop, 1.1, 91);
  // "Powerful": everything, fortissimo, with the soloist in double stops.
  tutti(cost.bashStop, 1.4, chordAt(plan, cost.bashStop), .8, true);
  drive(cost.bashStop, cost.depletion.at - BEAT / 2, {solo: 'double', tremolo: 32, chug: 16, timp: 'drive', cassa: true, level: 1});
  tutti(cost.bashWarning, 1.1, chordAt(plan, cost.bashWarning), .35);
  // The budget runs out: the orchestra stops dead and the violin drains down a slowing G minor line.
  tutti(cost.depletion.at, 1.2, chordAt(plan, cost.depletion.at), .3, true);
  drainLine(cost.depletion.at + .25, cost.depletion.duration, 93, 30, () => GM.pad)
    .forEach(({time, midi, progress}) => note(mix, time, midi, .08 + .25 * progress, .9 - .45 * progress, SOLO, {level: 1 - .4 * progress}));
  bowed(mix, cost.depletion.at + .25, cost.depletion.at + cost.depletion.duration + .3, 31, VC, {section: 'celli', dynamics: [.6, .15], attack: .1, release: .8, level: .8});

  // "Until now.": a trill over a timpani roll and a violin swell, one beat of silence, and the drop.
  const drop = flow.reveal, breath = drop - BEAT;
  const tension = Math.max(cost.depletion.at + cost.depletion.duration + .3, breath - BAR * 1.5);
  trill(mix, tension, breath - BEAT, 81, 1, [.35, 1], SOLO);
  run(mix, breath - BEAT, breath, 74, 93, G_MINOR, [.7, 1], SOLO, {curve: 1.2});
  roll(mix, tension, breath, 38, [.08, .85], DRUM);
  for (const midi of [54, 60, 66]) bowed(mix, tension, breath, midi, {...VLN, pan: -.3 + (midi - 54) / 30}, {section: 'violins', dynamics: [.15, 1], attack: .4, release: .05, level: .6});
  bowed(mix, tension, breath, 38, VC, {section: 'celli', dynamics: [.2, 1], attack: .4, release: .05, level: .9});

  // ------------------------------------------------ Flow-1: G major, the whole orchestra, presto.
  tutti(drop, 1.6, chordAt(plan, drop), 1, true);
  drive(drop, flow.cameraToAnalysis.at - BEAT, {solo: 'storm', tremolo: 32, chug: 16, timp: 'drive', cassa: true, sustain: true, level: 1});
  tutti(flow.cameraToAnalysis.at, 1.1, chordAt(plan, flow.cameraToAnalysis.at), .4, true);
  drive(flow.cameraToAnalysis.at + BEAT, flow.cameraToEngine.at - BAR, {solo: 'arp', tremolo: 32, chug: 16, timp: 'drive', sustain: true, level: 1});
  build(flow.cameraToEngine.at - BAR, flow.cameraToEngine.at, 1, 93);
  tutti(flow.cameraToEngine.at, 1.2, chordAt(plan, flow.cameraToEngine.at), .4, true);
  drive(flow.cameraToEngine.at + BEAT / 2, flow.coverShut - BEAT, {solo: 'double', tremolo: 32, chug: 16, timp: 'drive', cassa: true, level: 1});
  run(mix, flow.coverShut - BEAT, flow.coverShut - .02, 79, 98, G_MAJOR, [.7, 1], SOLO, {curve: 1.2});
  // The door shuts on a deceptive E♭ — the drama isn't over.
  tutti(flow.coverShut, 1.4, chordAt(plan, flow.coverShut), 1.2, true);
  roll(mix, flow.coverShut + 1, issues.leadIn.at - .02, 39, [.1, .6], DRUM);

  // ------------------------------------------------ Issues: E minor, then the climb back to G.
  const {prelude} = issues;
  tutti(issues.leadIn.at, 1, chordAt(plan, issues.leadIn.at), .4, true);
  drive(issues.leadIn.at, prelude.zoomOut.at, {solo: 'bariolage', tremolo: 16, chug: 8, timp: 'beats', level: .8});
  if (prelude.labels) drive(prelude.labels.at, prelude.labels.at + prelude.labels.duration, {pizz: true, level: .8});
  build(prelude.zoomOut.at, issues.native, 1.15, 96);
  drive(prelude.zoomOut.at, issues.native - BEAT, {chug: 16, timp: 'drive', level: [.7, 1]});
  tutti(issues.native, 1.5, chordAt(plan, issues.native), .9, true);
  drive(issues.native, conclusion.start, {solo: 'storm', tremolo: 32, chug: 16, timp: 'drive', cassa: true, sustain: true, level: 1});
  tutti(issues.clusters[0], 1.1, chordAt(plan, issues.clusters[0]), .35, true);

  // ------------------------------------------------ Conclusion: the cadenza, the logo, the hammer strokes.
  const logo = conclusion.logo;
  tutti(conclusion.start, 1.1, chordAt(plan, conclusion.start), .35, true);
  drive(conclusion.start, logo - BAR, {solo: 'double', tremolo: 32, chug: 16, timp: 'drive', level: 1});
  build(logo - BAR, logo, 1.25, 98);
  tutti(logo, 1.7, chordAt(plan, logo), end - logo - .6, true);
  bowed(mix, logo + .1, end - .3, 91, SOLO, {dynamics: [1, .6], attack: .05, release: .6, level: .9});
  const last = cues.voice.at(-1), button = last ? Math.max(logo + 1.2, last.at + last.duration) : logo + 1.4;
  if (button < end - .3) tutti(button, 1.5, chordAt(plan, logo), Math.max(.3, end - button - .3), true);
}
