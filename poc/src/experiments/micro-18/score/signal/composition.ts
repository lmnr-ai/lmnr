import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bass, beep, hat, kick, pad, piano, pluck, reverseSwell, riser, strings, type Mix, type Pump, type Route} from '../voices';
import {melody, rolled, type Chord, type Progression, chordAt} from '../writing';

/*
 * "Signal" — A major, electronic neo-classical. A felt piano carries the melody over a pulsing
 * 16th sequencer, the agent's process made audible. The music breaks the way software does:
 * it stutters and tape-stops when the agent fails, when the cheap model misses the issue, and
 * when the budget runs dry. After "Until now" the sequencer boots again and never breaks;
 * on the logo it thins to a single A.
 */

const KEYS: Route = {bus: 'music', hall: .3, room: .06, delay: .14};
const SEQ: Route = {bus: 'music', hall: .12, delay: .2};
const PAD: Route = {bus: 'music', hall: .3};
const DRUM: Route = {bus: 'music', room: .1};
const SUB: Route = {bus: 'music', gain: .42, hall: .03};

const C = {
  A: {bass: 45, tones: [57, 61, 64, 69, 71, 73, 76]}, EGs: {bass: 44, tones: [56, 59, 64, 68, 71, 76]},
  Fsm: {bass: 42, tones: [57, 61, 66, 69, 73, 76]}, D: {bass: 38, tones: [57, 62, 66, 69, 74, 76]},
  Bm: {bass: 47, tones: [54, 59, 62, 66, 71, 74]}, E: {bass: 40, tones: [56, 59, 64, 68, 71, 76]},
  Esus: {bass: 40, tones: [57, 59, 64, 69, 71, 76]}, Cs: {bass: 37, tones: [56, 61, 65, 68, 73, 77]},
  AC: {bass: 49, tones: [57, 61, 64, 69, 73, 76]},
} satisfies Record<string, Chord>;
/** Pad voicing: the three lowest tones plus the top one. */
const padOf = (chord: Chord) => [...chord.tones.slice(0, 3), chord.tones.at(-1)!];
const SHAPE = [0, 2, 4, 3, 5, 3, 4, 2];

type Line = {from: number; to: number; progression: Progression; velocity?: (beat: number) => number; bright?: (beat: number) => number; octave?: number; route?: Route};

export function composeSignal(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  const pump: Pump = {origin: g(0), period: .5, depth: .45};
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;

  /** The sequencer: 16th saw plucks walking the chord, filter riding `bright`. */
  const sequence = ({from, to, progression, velocity = () => .5, bright = () => .45, octave = 0, route = SEQ}: Line) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const beat = step / 4, [start, chord] = chordAt(progression, beat);
      const k = Math.round((beat - Math.max(start, from)) * 4);
      const accent = step % 4 === 0 ? 1 : step % 2 ? .66 : .8;
      pluck(mix, g(beat), chord.tones[SHAPE[k % SHAPE.length] % chord.tones.length] + octave, velocity(beat) * accent, {...route, pan: step % 2 ? .28 : -.28}, {decay: .11, bright: bright(beat)});
    }
  };
  const pads = (progression: Progression, to: number, options: {level?: number; cutoff?: [number, number]; pump?: boolean; attack?: number} = {}) =>
    progression.forEach(([beat, chord], i) => pad(mix, g(beat), g(i + 1 < progression.length ? progression[i + 1][0] : to) + .02, padOf(chord), PAD,
      {attack: options.attack ?? .25, release: .5, cutoff: options.cutoff ?? [700, 1500], level: options.level ?? .8, pump: options.pump === false ? undefined : pump}));
  const subs = (progression: Progression, to: number, velocity = .6) =>
    progression.forEach(([beat, chord], i) => bass(mix, g(beat), chord.bass - 12, g(i + 1 < progression.length ? progression[i + 1][0] : to) - g(beat) - .05, velocity, SUB, {drive: 1.2}));
  const fourOnFloor = (from: number, to: number, level = 1, offbeatHats = true) => {
    for (let beat = Math.ceil(from); beat < to; beat++) {
      kick(mix, g(beat), .42 * level, DRUM);
      if (offbeatHats) hat(mix, g(beat + .5), .42 * level, {...DRUM, pan: .25}, .03);
      hat(mix, g(beat + .75), .18 * level, {...DRUM, pan: -.3}, .016);
    }
  };

  // ── You build agents: the sequencer powers on, one A in 8ths, the filter opening.
  const streamFrom = at(u2.stream.at, 1), fail = u2.failure, failBeat = beatAt(fail);
  rolled(mix, u2.agentEnter + .02, [45, 52, 57], .36, KEYS, {length: 4.2, bright: .4, spread: .03});
  for (let beat = 1; beat < streamFrom; beat += .5) pluck(mix, g(beat), 69, .22 + .06 * beat / streamFrom, {...SEQ, pan: beat % 1 ? .2 : -.2}, {decay: .1, bright: .15 + .25 * beat / streamFrom});
  pad(mix, g(1), g(streamFrom) + .05, [45, 57, 64], PAD, {attack: 1.5, release: .4, cutoff: [300, 900], level: .7});

  // ── Every time your agent runs, it leaves a trace: the process in full 16ths.
  const run: Progression = [[streamFrom, C.A], [streamFrom + 2, C.EGs], [streamFrom + 4, C.Fsm]];
  sequence({from: streamFrom, to: failBeat + 1, progression: run, velocity: beat => .42 + .12 * (beat - streamFrom) / (failBeat - streamFrom), bright: () => .5});
  pads(run, failBeat + 1, {level: .7});
  subs(run, failBeat + 1, .5);
  for (let beat = streamFrom; beat < failBeat + 1; beat += .5) hat(mix, g(beat + .25), .14, {...DRUM, pan: .3}, .012);
  melody(mix, g, [[streamFrom, 76, 1], [streamFrom + 1, 73, 1], [streamFrom + 2, 71, 1.5], [streamFrom + 3.5, 68, .5], [streamFrom + 4, 69, 2]], KEYS, {velocity: .5, bright: .5});

  // ── When your agent fails: the buffer glitches and the whole thing tape-stops.
  mix.stutter(fail, .0625, 3);
  mix.tapeStop(fail + .1875, .45, 1.4);

  // ── The trace can tell you why: felt piano alone, searching in F♯ minor.
  const turn = at(u2.upwardTurn.at);
  rolled(mix, g(turn), [42, 49, 54], .28, KEYS, {length: 4, bright: .35});
  melody(mix, g, [[turn + .5, 69, 1], [turn + 1.5, 71, 1], [turn + 2.5, 73, 1.5]], KEYS, {velocity: .38, bright: .45});
  reverseSwell(mix, u2.drawers[0], u2.drawers[0] - u2.backtrack.at, [54, 61, 66, 69], {...PAD, gain: .7});
  bass(mix, u2.drawers[0], 26, u2.insights - u2.drawers[0], .45, SUB, {drive: 1});
  pad(mix, u2.drawers[0], u2.highlight.at, [50, 57, 61, 66], PAD, {attack: .8, release: .8, cutoff: [400, 1100], level: .6});
  u2.drawers.forEach((time, i) => piano(mix, time, [73, 76, 81][i], .38 + i * .05, {...KEYS, pan: -.2 + i * .2}, {length: 2.8, bright: .5}));
  pad(mix, u2.highlight.at, u2.insights + .1, padOf(C.Bm), PAD, {attack: .4, release: .5, cutoff: [500, 1200], level: .6});
  bass(mix, u2.highlight.at, 35, u2.insights - u2.highlight.at, .4, SUB);

  // ── The insights are hidden across thousands of traces: the process resumes, filtered, building.
  const insights = at(u2.insights, 1), ifOnly = at(u2.ifOnly, 1);
  const hidden: Progression = [[insights, C.D], [insights + 2, C.AC], [insights + 4, C.Bm], [insights + 6, C.Esus]];
  const rise = (beat: number) => (beat - insights) / (ifOnly - insights);
  sequence({from: insights, to: ifOnly, progression: hidden, velocity: beat => .3 + .2 * rise(beat), bright: beat => .15 + .45 * rise(beat)});
  pads(hidden, ifOnly, {level: .75});
  subs(hidden, ifOnly, .5);
  for (let beat = insights + 4; beat < ifOnly; beat++) kick(mix, g(beat), .22 + .2 * rise(beat), DRUM);
  melody(mix, g, [[insights + 1, 74, 1], [insights + 2, 73, 1], [insights + 3, 69, 1.5], [insights + 4.5, 71, .5], [insights + 5, 74, 1], [insights + 6, 76, 2]], KEYS, {velocity: .5, bright: .55});

  // ── If only someone could read them all: everything drops away but piano and sub.
  rolled(mix, g(ifOnly), [38, 50, 57, 64, 66, 69], .34, KEYS, {length: 3.2, bright: .4, spread: .035});
  bass(mix, g(ifOnly), 26, 1.9, .45, SUB);
  piano(mix, g(ifOnly + 1), 76, .28, {...KEYS, pan: .25}, {length: 2.4, bright: .45});

  // ── Cheap LLMs read traces efficiently: a thin, bright, too-fast sequence…
  const cheap = at(cost.cloudOut.at, 1), miss = at(cost.missIssues, 1);
  const thin: Progression = [[cheap, C.A], [cheap + 2, C.E]];
  for (let step = cheap * 4; step < (miss + .5) * 4; step++) {
    const [, chord] = chordAt(thin, step / 4);
    beep(mix, g(step / 4), chord.tones[SHAPE[step % 8] % chord.tones.length] + 12, .28 * (step % 2 ? .7 : 1), {...SEQ, pan: step % 2 ? .35 : -.35}, {length: .06, wave: 'square'});
  }
  for (let beat = cheap; beat < miss + .5; beat += .25) hat(mix, g(beat), beat % 1 ? .12 : .22, {...DRUM, pan: .2}, .012);
  // …but fail to find crucial issues: it chokes on a buffer glitch and dies.
  mix.stutter(g(miss), .03125, 8);
  mix.tapeStop(g(miss) + .25, .4, 1.2);
  bass(mix, g(miss + 1), 30, cost.powerful - g(miss + 1) + .2, .38, SUB, {drive: 1});
  rolled(mix, g(miss + 1), [42, 54], .32, KEYS, {length: 3.5, bright: .3, spread: .01});

  // ── Powerful LLMs find deep issues: weight — driven sub, half-time kick, low piano octaves.
  const heavyFrom = Math.round(at(cost.powerful, 1)), budget = at(cost.cameraToBudget.at, 1);
  const heavy: Progression = [[heavyFrom, C.Fsm], [heavyFrom + 2, C.D], [heavyFrom + 4, C.Bm], [heavyFrom + 6, C.Cs]];
  heavy.forEach(([beat, chord], i) => {
    const to = i < 3 ? heavy[i + 1][0] : budget;
    bass(mix, g(beat), chord.bass - 12, g(to) - g(beat) - .05, .5, SUB, {drive: 3, glide: -2});
    rolled(mix, g(beat), [chord.bass - 12, chord.bass], .5, KEYS, {length: 1.8, bright: .3, spread: .004});
  });
  pads(heavy, budget, {level: .55, cutoff: [300, 700]});
  for (let beat = heavyFrom; beat < budget; beat += 2) kick(mix, g(beat), .45, DRUM);
  sequence({from: heavyFrom + 2, to: budget, progression: heavy, velocity: () => .32, bright: () => .22, octave: -12});
  melody(mix, g, [[heavyFrom + 1, 69, 1], [heavyFrom + 3, 69, 1], [heavyFrom + 5, 66, 1], [heavyFrom + 7, 65, 1.5]], {...KEYS, pan: .15}, {velocity: .42, octave: true, bright: .4});

  // ── …but the costs are unsustainable: a brief lift on the budget, then the tape runs down.
  const drain = at(cost.depletion.at, 1), untilNow = at(cost.depletion.at + cost.depletion.duration, 1);
  const spend: Progression = [[budget, C.A], [budget + 2, C.EGs], [drain, C.Fsm], [drain + 2, C.D]];
  sequence({from: budget, to: untilNow, progression: spend, velocity: () => .42, bright: () => .45});
  pads(spend, untilNow, {level: .75});
  subs(spend, untilNow, .55);
  fourOnFloor(budget, untilNow, .6, false);
  melody(mix, g, [[budget, 76, 1], [budget + 1, 78, 1], [budget + 2, 76, 1.5], [budget + 3.5, 73, .5], [drain, 73, 2], [drain + 2, 69, 2]], KEYS, {velocity: .48, bright: .5});
  mix.tapeStop(cost.depletion.at + .25, cost.depletion.duration - .1, 1.9);

  // ── Until now. Near silence — one blip — and the machine starts to wake.
  const entry = at(flow.entry.at, 1), drop = at(flow.reveal, 1);
  beep(mix, g(untilNow + 1), 81, .12, {...SEQ, delay: .5}, {length: .08});
  riser(mix, g(entry - 1), flow.reveal, {...PAD, gain: .8}, {level: .06, fromMidi: 57, toMidi: 81});
  reverseSwell(mix, flow.reveal, 1.6, [57, 64, 69, 73, 76], {...PAD, gain: .8});
  for (let step = entry * 4; step < drop * 4; step++) {
    const progress = (step - entry * 4) / ((drop - entry) * 4);
    if (progress < .5 && step % 2) continue;
    pluck(mix, g(step / 4), [57, 64, 69, 76][step % 4], .2 + .3 * progress, {...SEQ, pan: step % 2 ? .25 : -.25}, {decay: .1, bright: .1 + .5 * progress});
  }

  // ── Introducing Flow-1: the drop. Pulse, pumping pads, the piano theme on top.
  const coverShut = flow.coverShut, shutBeat = beatAt(coverShut);
  const theme: [number, Chord][] = [];
  for (let beat = drop, i = 0; beat < shutBeat; beat += 4, i++) theme.push([beat, [C.A, C.E, C.Fsm, C.D][i % 4]]);
  rolled(mix, flow.reveal, [33, 45, 57, 64, 69, 73], .55, KEYS, {length: 5, bright: .55, spread: .01});
  sequence({from: drop, to: shutBeat, progression: theme, velocity: beat => .46 + .08 * (beat - drop) / (shutBeat - drop), bright: beat => .45 + .2 * (beat - drop) / (shutBeat - drop)});
  pads(theme, shutBeat, {level: .9, cutoff: [900, 2000]});
  theme.forEach(([beat, chord], i) => {
    const to = i + 1 < theme.length ? theme[i + 1][0] : shutBeat;
    for (let b = beat; b < to - 1e-9; b += .5) bass(mix, g(b), chord.bass - (b % 1 ? 0 : 12), .2, b % 1 ? .38 : .72, SUB, {glide: b % 1 ? 0 : -1});
  });
  fourOnFloor(drop, shutBeat);
  strings(mix, flow.reveal, coverShut, [57, 64, 69], PAD, {attack: 1.5, release: .8, dynamics: [.3, .7], bright: .5, level: .6, pump});
  const motif: [number, number, number][] = [[0, 76, 1], [1, 73, 1], [2, 71, 1.5], [3.5, 69, .5], [4, 71, 2], [6, 68, 1], [7, 64, 1],
    [8, 69, 1], [9, 73, 1], [10, 76, 1.5], [11.5, 78, .5], [12, 76, 2], [14, 74, 2]];
  for (const phrase of [drop, drop + 16]) melody(mix, g, motif.filter(([beat]) => phrase + beat < shutBeat - .5).map(([beat, midi, length]) => [phrase + beat, midi + (phrase > drop ? 12 : 0), length] as const),
    {...KEYS, pan: .12}, {velocity: .52, octave: phrase > drop, bright: .6});
  // The benchmark readout and the bars growing: a bright upward arp answers the numbers.
  [69, 73, 76, 81, 85, 88].forEach((midi, i) => pluck(mix, flow.barsGrow.at + i * flow.barsGrow.duration / 6, midi, .45, {...SEQ, pan: -.4 + i * .16}, {decay: .2, bright: .8}));

  // ── The door closes on Signals: the pulse cuts, E sus hangs.
  rolled(mix, coverShut, [28, 40, 52, 57, 59, 64], .55, KEYS, {length: 3.5, bright: .45, spread: .008});
  pad(mix, coverShut, issues.native, padOf(C.Esus), PAD, {attack: .05, release: 1, cutoff: [1400, 500], level: .8});
  bass(mix, coverShut, 28, issues.native - coverShut - .2, .6, SUB);

  // ── It finds deep issues, in every trace: a soft bed under the blips, then motion toward the clusters.
  const native = beatAt(issues.native), travel = Math.ceil(at(issues.travel.at)), lock = issues.clusters[0], lockBeat = beatAt(lock);
  pad(mix, issues.native - .3, g(travel), padOf(C.A), PAD, {attack: .8, release: .4, cutoff: [500, 1100], level: .7});
  bass(mix, issues.native, 33, g(travel) - issues.native, .45, SUB);
  const gather: Progression = [[travel, C.D], [travel + 2, C.Esus]];
  sequence({from: travel, to: lockBeat, progression: gather, velocity: beat => .3 + .2 * (beat - travel) / (lockBeat - travel), bright: beat => .2 + .5 * (beat - travel) / (lockBeat - travel)});
  pads(gather, lockBeat, {level: .8, cutoff: [600, 1800]});
  subs(gather, lockBeat, .5);
  for (let step = Math.ceil((lockBeat - 2) * 4); step < lockBeat * 4; step++) hat(mix, g(step / 4), .1 + .25 * (step / 4 - lockBeat + 2) / 2, {...DRUM, pan: .15}, .014);

  // …clusters them into patterns, ready for you or your coding agent: the groove locks in.
  const conclusion = at(end.start, 1);
  const ready: Progression = [[Math.round(lockBeat), C.A], [Math.round(lockBeat) + 2, C.EGs], [Math.round(lockBeat) + 4, C.Fsm], [Math.round(lockBeat) + 6, C.D]];
  rolled(mix, lock, [45, 57, 64, 69, 73, 76], .52, KEYS, {length: 3, bright: .55});
  sequence({from: lockBeat, to: conclusion, progression: ready, velocity: () => .42, bright: () => .5});
  pads(ready, conclusion, {level: .85, cutoff: [800, 1800]});
  subs(ready, conclusion, .55);
  fourOnFloor(lockBeat, conclusion, .8);
  melody(mix, g, [[Math.round(lockBeat) + 1, 81, 1], [Math.round(lockBeat) + 2, 80, 1], [Math.round(lockBeat) + 3, 76, 2], [Math.round(lockBeat) + 5, 73, 1], [Math.round(lockBeat) + 6, 74, 2]], KEYS, {velocity: .45, bright: .55});

  // ── Unlock the insights hiding in millions of traces: IV → V, everything opening.
  const logo = end.logo, logoBeat = beatAt(logo);
  const lift: Progression = [[conclusion, C.D], [conclusion + 2, C.E]];
  sequence({from: conclusion, to: logoBeat, progression: lift, velocity: beat => .45 + .15 * (beat - conclusion) / 4, bright: beat => .5 + .3 * (beat - conclusion) / 4});
  pads(lift, logoBeat, {level: 1, cutoff: [1000, 2600]});
  subs(lift, logoBeat, .6);
  fourOnFloor(conclusion, logoBeat, .9);
  for (let step = (logoBeat - 1) * 4; step < logoBeat * 4; step++) hat(mix, g(step / 4), .15 + .2 * (step / 4 - logoBeat + 1), {...DRUM, pan: .1}, .016);
  strings(mix, g(conclusion), logo, [50, 57, 62, 69], PAD, {attack: .6, release: .1, dynamics: [.4, 1], bright: .6, level: .8});
  melody(mix, g, [[conclusion, 76, 1], [conclusion + 1, 78, 1], [conclusion + 2, 80, 1.5], [conclusion + 3.5, 83, .5]], KEYS, {velocity: .55, octave: true, bright: .6});
  riser(mix, logo - 1.5, logo, {...PAD, gain: .8}, {level: .05, fromMidi: 64, toMidi: 88});

  // ── With Laminar: home to A. The sequencer is left on one note, fading like a heartbeat.
  kick(mix, logo, .5, DRUM);
  rolled(mix, logo, [33, 45, 57, 64, 69, 73, 81], .55, KEYS, {length: end.end - logo, bright: .55, spread: .012});
  pad(mix, logo, end.end - .8, [45, 57, 64, 69, 73, 76], PAD, {attack: .05, release: .8, cutoff: [2200, 700], level: 1});
  bass(mix, logo, 33, end.end - logo - .8, .65, SUB);
  for (let beat = logoBeat + .5; beat < beatAt(end.end) - .5; beat += .5) pluck(mix, g(beat), 81, .34 * (1 - (beat - logoBeat) / 4), {...SEQ, pan: beat % 1 ? .2 : -.2}, {decay: .12, bright: .4});
}
