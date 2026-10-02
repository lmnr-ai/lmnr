import type {ScoreCues} from '../cues';
import {clamp} from '../dsp';
import {beatOf, gridOf} from '../style';
import {bowed, piano, pizz, type Mix, type Route} from '../voices';
import {humanize, legato, rolled} from '../writing';

/*
 * "Tintinnabuli" — F major and its relative D minor, after Arvo Pärt. Every line is two voices: an
 * M-voice walking the scale and a T-voice ringing the nearest note of one triad. It is the film in
 * miniature: the agent's steps, and the trace that rings under each one. The budget drains as a
 * descending canon (Cantus), the drop is an ascending mensuration canon, and struck low piano octaves
 * are the bells that mark each turn.
 */

const BELL: Route = {bus: 'music', hall: .5, room: .02};
const KEYS: Route = {bus: 'music', hall: .4, room: .04, pan: -.15};
const SECTION: Route = {bus: 'music', hall: .44, room: .04};
const SOLO: Route = {bus: 'music', hall: .46, room: .03, pan: .12};
const PLUCK: Route = {bus: 'music', hall: .4, room: .05, pan: .3};

const pc = (midi: number) => (midi % 12 + 12) % 12;
// F major, which is also D Aeolian: one set of seven notes for the whole film.
const SCALE = [5, 7, 9, 10, 0, 2, 4];
const T = {F: [5, 9, 0], Dm: [2, 5, 9], Bb: [10, 2, 5], C: [0, 4, 7], Am: [9, 0, 4]};
type Triad = readonly number[];

/** The M-voice: `steps` scale degrees from `midi`. */
const walk = (midi: number, steps: number) => {
  let note = midi;
  for (let taken = 0; taken < Math.abs(steps);) if (SCALE.includes(pc(note += Math.sign(steps)))) taken++;
  return note;
};
/** The T-voice: the nearest triad note strictly above (1) or below (-1). */
const ring = (midi: number, triad: Triad, direction: 1 | -1) => {
  let note = midi + direction;
  while (!triad.includes(pc(note))) note += direction;
  return note;
};
type Line = [beat: number, midi: number, beats: number, dynamic?: number | [number, number]][];
/** A mensuration line: `steps` scale degrees from `root`, one note every `beats`. */
const canon = (from: number, to: number, root: number, beats: number, steps: readonly number[], dynamic: number): Line =>
  Array.from({length: Math.ceil((to - from) / beats - 1e-9)}, (_, i) =>
    [from + i * beats, walk(root, steps[i % steps.length]), Math.min(beats, to - from - i * beats), dynamic]);
const RISE_FALL = [0, 1, 2, 3, 4, 3, 2, 1];

export function composeTintinnabuli(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;

  /** A struck low octave, left to ring: Pärt's bell. */
  const bell = (time: number, root: number, velocity = .5, length = 6) => {
    piano(mix, time, root, velocity, BELL, {length, bright: .35});
    piano(mix, time + .004, root + 12, velocity * .75, BELL, {length, bright: .4});
  };
  /** Piano triad figures (Spiegel im Spiegel): `triad` tones rising from `low`, one per `step` beats. */
  const spiegel = (from: number, to: number, low: number, triadAt: (beat: number) => Triad, velocity: number, step = 1) => {
    let note = low - 1;
    for (let beat = from; beat < to - 1e-9; beat += step) {
      const triad = triadAt(beat);
      note = ring(note, triad, 1);
      if (note > low + 12) note = ring(low - 1, triad, 1);
      const [time, v] = humanize(mix, g(beat), velocity);
      piano(mix, time, note, v, KEYS, {length: 2.4, bright: .4});
    }
  };
  /** Bowed M-voice with its T-voice in the same rhythm: in the same section when `t` is a section, else rung on the piano. */
  const voiced = (line: Line, triadAt: (beat: number) => Triad, direction: 1 | -1, m: {section?: 'violin' | 'violins' | 'celli'; route: Route; level: number},
    t: {section?: 'violins' | 'celli'; route: Route; level: number; octave?: number} | 'piano') => {
    legato(mix, g, line, m.route, {section: m.section, level: m.level});
    const tones: Line = line.map(([beat, midi, beats, dynamic]) => [beat, ring(midi, triadAt(beat), direction) + (t === 'piano' ? 0 : t.octave ?? 0), beats, dynamic]);
    if (t === 'piano') tones.forEach(([beat, midi]) => piano(mix, g(beat) + .012, midi, .2, {...KEYS, pan: .1}, {length: 2.2, bright: .4}));
    else legato(mix, g, tones, t.route, {section: t.section, level: t.level});
  };
  const hold = (from: number, to: number, midi: number, section: 'violin' | 'violins' | 'celli', dynamics: [number, number], level: number, release = .8) =>
    bowed(mix, g(from), g(to), midi, section === 'violin' ? SOLO : {...SECTION, pan: section === 'celli' ? -.35 : .05 + (midi - 60) * .02}, {section, dynamics, attack: .4, release, level});
  const chord = (from: number, to: number, celli: readonly number[], violins: readonly number[], dynamics: [number, number], level = 1, release = .8) => {
    celli.forEach(midi => hold(from, to, midi, 'celli', dynamics, level * .5, release));
    violins.forEach(midi => hold(from, to, midi, 'violins', dynamics, level * .36, release));
  };
  /** Additive phrases (Pärt's Passio): phrase n starts n steps from the centre, above then below by turns, and walks back to it. */
  const phrases = (from: number, to: number, centre: number, triad: Triad, level: number) => {
    const line: Line = [];
    for (let n = 1, beat = from; beat < to - 1e-9; n++) {
      const steps = n % 2 ? n : -n;
      for (let s = steps; beat < to - 1e-9; s -= Math.sign(steps)) {
        line.push([beat, walk(centre, s), 1, .45 + .03 * Math.min(n, 4)]);
        beat++;
        if (s === 0) break;
      }
      beat++;
    }
    voiced(line, () => triad, -1, {route: SOLO, level}, 'piano');
  };

  // ── You build agents: a bell on F, a rising triad figure, and the violin's first phrases around A.
  const stream = at(u2.stream.at, 1), fail = at(u2.failure, 1), back = at(u2.backtrack.at, 1), highlight = at(u2.highlight.at, 1);
  const insights = at(u2.insights, 1), ifOnly = at(u2.ifOnly, 1);
  bell(u2.agentEnter + .02, 29, .42);
  spiegel(1, fail, 53, () => T.F, .2);
  phrases(stream, fail, 69, T.F, .8);

  // ── When it fails: the figure stops, a bell on D, the violin sighs B♭ to A over the relative minor.
  bell(u2.failure, 38, .5);
  hold(fail, highlight, 38, 'celli', [.5, .3], .5);
  chord(fail, back, [], [62, 65], [.35, .2], .8);
  legato(mix, g, [[fail, 70, 1.5, [.6, .45]], [fail + 1.5, 69, back - fail - 1.5, [.45, .25]]], SOLO, {level: .8});
  // Backtracking: D minor falls through two octaves.
  [74, 69, 65, 62, 69, 65, 62, 57].forEach((midi, i) => {
    const [time, v] = humanize(mix, g(back + i * .5), .26 - i * .015);
    piano(mix, time, midi, v, KEYS, {length: 2, bright: .4});
  });
  u2.drawers.forEach((time, i) => piano(mix, time, [74, 77, 81][i], .24 + .03 * i, {...KEYS, pan: -.2 + .2 * i}, {length: 2.4, bright: .5}));
  chord(highlight, insights, [38, 45], [62, 69], [.25, .5], .8);

  // ── The insights are hidden across thousands of traces: a D-minor chorale, an M-voice between two T-voices.
  const chorale: Line = [[insights, 69, 2, .5], [insights + 2, 67, 2, .55], [insights + 4, 65, 2, .6], [insights + 6, 64, 1.5, .6], [insights + 7.5, 62, ifOnly - insights - 7.5, [.6, .4]]];
  voiced(chorale, () => T.Dm, 1, {section: 'violins', route: {...SECTION, pan: .1}, level: .5}, {section: 'violins', route: {...SECTION, pan: .3}, level: .38});
  legato(mix, g, chorale.map(([beat, midi, beats, dynamic]) => [beat, ring(midi, T.Dm, -1) - 12, beats, dynamic]), {...SECTION, pan: -.3}, {section: 'celli', level: .5});
  hold(insights, ifOnly, 38, 'celli', [.4, .55], .4);
  chorale.forEach(([beat, midi]) => piano(mix, g(beat) + .01, ring(midi, T.Dm, 1) + 12, .14, KEYS, {length: 3, bright: .35}));
  // ── If only someone could read them all: a bell, and a high C left hanging over D.
  bell(u2.ifOnly, 38, .44);
  hold(ifOnly, ifOnly + 2.5, 84, 'violin', [.35, .15], .55, 1.4);
  hold(ifOnly, ifOnly + 2.5, 50, 'celli', [.4, .15], .4, 1.2);

  // ── Cheap LLMs read traces efficiently: pizzicato M and T voices in eighths, high and light.
  const cheap = at(cost.cloudOut.at, 1), miss = at(cost.missIssues, 1), bash = at(cost.cameraToBash.at, 1);
  const pluck = (from: number, to: number, keep: (voice: 'm' | 't') => boolean, velocity: (beat: number) => number) => {
    for (let beat = from, i = 0; beat < to - 1e-9; beat += .5, i++) {
      const m = walk(77, RISE_FALL[Math.floor(i / 2) % 8]), voice = i % 2 ? 't' : 'm';
      if (!keep(voice)) continue;
      const [time, v] = humanize(mix, g(beat), velocity(beat));
      pizz(mix, time, voice === 'm' ? m : ring(m, T.F, 1), v, {...PLUCK, pan: voice === 'm' ? .3 : -.1}, {length: .8});
    }
  };
  pluck(cheap, miss, () => true, () => .34);
  // …but fail to find crucial issues: the melody drops out and only its echo is left, over a tritone bell.
  pluck(miss, bash, voice => voice === 't', beat => .34 * (1 - .6 * clamp((beat - miss) / (bash - miss))));
  bell(cost.missIssues, 35, .44);
  piano(mix, cost.missIssues + .01, 53, .3, BELL, {length: 4, bright: .3});
  chord(miss, bash + 1, [35, 41], [], [.2, .45], .8);

  // ── Powerful LLMs find deep issues: celli descend in half notes, the violins ring above, bells on the stops.
  const heavy = Math.ceil(at(cost.powerful)), budget = at(cost.cameraToBudget.at, 1);
  const descent: Line = [[heavy, 50, 2, .8], [heavy + 2, 48, 2, .8], [heavy + 4, 46, 2, .85], [heavy + 6, 45, budget - heavy - 6, .85]];
  voiced(descent, () => T.Dm, 1, {section: 'celli', route: {...SECTION, pan: -.3}, level: .6}, {section: 'violins', route: {...SECTION, pan: .25}, level: .38, octave: 12});
  legato(mix, g, descent.map(([beat, midi, beats, dynamic]) => [beat, midi - 12, beats, dynamic]), {...SECTION, pan: -.4}, {section: 'celli', level: .45});
  bell(cost.bashStop, 26, .56, 4);
  bell(cost.bashWarning, 33, .46, 4);

  // ── …but the costs are unsustainable: a warm B♭, then the budget drains as a descending canon (Cantus).
  const drain = at(cost.depletion.at, 1), entry = at(flow.entry.at, 1), drop = at(flow.reveal, 1);
  bell(g(budget), 34, .4);
  chord(budget, drain, [46], [62, 65, 70], [.4, .55], .9, .4);
  bell(g(drain), 33, .46, 8);
  // The solo falls a step every beat, the section every two beats, the celli every four; all come to rest on A–E.
  const cantus: Line = [81, 79, 77, 76, 74, 72, 70].map((midi, i) => [drain + i, midi, 1, .6 - i * .03]);
  voiced([...cantus, [drain + 7, 69, drop - drain - 7, [.4, .8]]], () => T.Am, -1, {route: SOLO, level: .8}, 'piano');
  legato(mix, g, [[drain, 69, 2, .5], [drain + 2, 67, 2, .48], [drain + 4, 65, 2, .45], [drain + 6, 64, drop - drain - 6, [.4, .85]]], {...SECTION, pan: .15}, {section: 'violins', level: .42});
  legato(mix, g, [[drain, 57, 4, .5], [drain + 4, 55, entry - drain - 4, .45]], {...SECTION, pan: -.3}, {section: 'celli', level: .5});
  // ── Until now. A bell on A, and the open fifth swells toward the drop.
  bell(g(entry), 33, .4);
  hold(entry, drop, 45, 'celli', [.2, .85], .5, .2);

  // ── Introducing Flow-1: F at last. An ascending mensuration canon, each voice at its own speed.
  const bench = at(flow.benchmark, 1), swap = at(flow.numberSwap.at, 1), engine = at(flow.cameraToEngine.at, 1), shut = flow.coverShut, shutBeat = at(shut);
  const triadAt = (beat: number) => beat < bench ? T.F : beat < swap ? T.Dm : beat < engine ? T.Bb : T.C;
  bell(flow.reveal, 29, .7, 7);
  rolled(mix, flow.reveal + .02, [53, 57, 60, 65], .44, KEYS, {length: 4, bright: .5});
  [[bench, 26], [swap, 34], [engine, 36]].forEach(([beat, root]) => bell(g(beat), root, .48));
  voiced(canon(drop, shutBeat, 77, 1, RISE_FALL, .62), triadAt, -1, {route: SOLO, level: .8}, 'piano');
  voiced(canon(drop, shutBeat, 65, 2, RISE_FALL, .55), triadAt, -1, {section: 'violins', route: {...SECTION, pan: .2}, level: .4}, {section: 'violins', route: {...SECTION, pan: -.05}, level: .32});
  voiced(canon(drop, shutBeat, 41, 4, RISE_FALL, .6), triadAt, -1, {section: 'celli', route: {...SECTION, pan: -.3}, level: .55}, {section: 'celli', route: {...SECTION, pan: -.45}, level: .4});
  spiegel(drop + 1, shutBeat, 65, triadAt, .16, .5);
  // The benchmark numbers drop as pizzicato bells; the bars grow as a rising M and T run; the engine rings high.
  flow.numberDrops.forEach((time, i) => pizz(mix, time, [81, 84, 89, 93][i % 4], .4, PLUCK, {length: 1}));
  const bars = at(flow.barsGrow.at, 4);
  for (let i = 0; i < 8; i++) {
    const m = walk(65, i), time = g(bars + i * .25);
    piano(mix, time, m, .18 + i * .02, {...KEYS, pan: -.3 + i * .08}, {length: 1.4, bright: .5});
    piano(mix, time + .01, ring(m, triadAt(bars), -1) + 12, .14 + i * .015, {...KEYS, pan: .3 - i * .05}, {length: 1.4, bright: .5});
  }
  piano(mix, flow.moduleActivation, 84, .3, {...BELL, pan: .2}, {length: 3, bright: .5});
  piano(mix, flow.moduleActivation + .01, 89, .24, {...BELL, pan: .3}, {length: 3, bright: .5});
  // Flow-1 powers Signals: the door shuts on a bell and a full F.
  bell(shut, 29, .7, 7);
  chord(shutBeat, at(issues.native, 1) + .5, [41, 48], [65, 69, 72], [.75, .2], 1, 1);
  hold(shutBeat, shutBeat + 5, 77, 'violin', [.75, .25], .75, 1);

  // ── It finds deep issues, in every trace: every other triangle rings a triad note by its height;
  // the foley's pizzicato takes the rest in the scale, so the pops are M and T voices too.
  const tones = [77, 81, 84, 89, 93, 96];
  issues.pops.forEach((pop, i) => {
    if (i % 2) return;
    piano(mix, pop.at, tones[Math.min(tones.length - 1, Math.floor(pop.height * tones.length))], .2 + mix.random() * .08, {...KEYS, pan: pop.pan * .8}, {length: 1.8, bright: .6});
  });
  // …and clusters them into high-level patterns: the section rises a step a beat over a C pedal to the lock.
  const travel = Math.round(at(issues.travel.at)), lock = issues.clusters[0], lockBeat = at(lock), finish = at(end.start, 1);
  const rise: Line = Array.from({length: Math.max(1, Math.floor(lockBeat - travel))}, (_, i) => [travel + i, walk(64, i), 1, .4 + .07 * i]);
  voiced(rise, () => T.C, -1, {section: 'violins', route: {...SECTION, pan: .2}, level: .42}, {section: 'violins', route: {...SECTION, pan: -.05}, level: .32});
  hold(travel, lockBeat, 36, 'celli', [.3, .75], .5, .2);
  bell(lock, 29, .6, 7);
  // Ready for you or your coding agent: the figure and the violin's phrases return, an octave higher.
  chord(lockBeat, finish, [41, 48], [60, 65, 69], [.6, .35], .9, .6);
  spiegel(lockBeat + 1, finish, 65, () => T.F, .18);
  phrases(lockBeat + 1, finish, 81, T.F, .7);

  // ── Unlock the insights hiding in millions of traces: IV then V, the canon rising to the logo.
  const logo = end.logo, logoBeat = at(logo);
  const toLogo = (beat: number) => beat < finish + 2 ? T.Bb : T.C;
  bell(end.start, 34, .5);
  bell(g(finish + 2), 36, .54);
  voiced(canon(finish, logoBeat, 77, .5, [0, 1, 2, 3, 4, 5, 6, 7], .65), toLogo, -1, {route: SOLO, level: .8}, 'piano');
  voiced([[finish, 62, 2, [.5, .65]], [finish + 2, 64, logoBeat - finish - 2, [.65, .8]]], toLogo, -1, {section: 'violins', route: {...SECTION, pan: .15}, level: .42}, {section: 'violins', route: {...SECTION, pan: -.1}, level: .34});
  legato(mix, g, [[finish, 46, 2, .6], [finish + 2, 48, logoBeat - finish - 2, [.6, .8]]], {...SECTION, pan: -.3}, {section: 'celli', level: .55});

  // ── With Laminar: the bell on F, the full triad, and the T-voice ringing out at the top.
  bell(logo, 29, .74, end.end - logo + .4);
  rolled(mix, logo + .025, [53, 57, 60, 65, 69], .46, KEYS, {length: end.end - logo, bright: .55, spread: .02});
  chord(logoBeat, at(end.end) - 2, [29, 41, 48], [65, 69, 72], [.9, .2], 1.1, 1.1);
  hold(logoBeat, logoBeat + 4, 89, 'violin', [.75, .3], .7, 1.2);
  [81, 84, 89, 93].forEach((midi, i) => piano(mix, logo + 1 + i * .25, midi, .2 - i * .02, {...KEYS, pan: -.2 + i * .15}, {length: 2.4, bright: .5}));
}
