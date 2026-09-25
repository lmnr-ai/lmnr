import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {beep, piano, strings, timpani, type Mix, type Route} from '../voices';
import {figure, melody, progression, rolled, type Chord, type Progression} from '../writing';

/*
 * "Nocturne" — E♭ major, a piano-led chamber score. The story is told in harmony:
 * the agent's stream is a Bach-style prelude that breaks off when it fails; the
 * search for "why" drifts into C minor; the cost section falls down a lament bass
 * to a G-major half cadence ("…unsustainable. Until now.") that pivots, by the
 * shared G, straight into E♭ for Flow-1. The theme (G–B♭–E♭–D…) is first spoken
 * over the insights, sung at the drop, and its D finally resolves to E♭ on the logo.
 */

const PIANO: Route = {bus: 'music', hall: .42, room: .05};
const CLOSE: Route = {bus: 'music', hall: .26, room: .08};
const STRINGS: Route = {bus: 'music', hall: .5};
const DRUM: Route = {bus: 'music', hall: .35};
const DATA: Route = {bus: 'music', gain: .8, hall: .3, delay: .25};

const C = {
  Eb: {bass: 39, tones: [51, 58, 62, 63, 67]}, BbD: {bass: 38, tones: [50, 58, 62, 65, 70]},
  Cm7: {bass: 36, tones: [48, 55, 58, 63, 67]}, Cm: {bass: 36, tones: [48, 55, 60, 63, 67]},
  Ab: {bass: 44, tones: [51, 55, 60, 63, 67]}, EbG: {bass: 43, tones: [51, 55, 58, 63, 67]},
  Fm9: {bass: 41, tones: [48, 56, 60, 63, 67]}, Bb7sus: {bass: 46, tones: [53, 58, 63, 65, 68]},
  Bb: {bass: 46, tones: [53, 58, 62, 65, 70]}, Cm9: {bass: 36, tones: [51, 55, 58, 62, 67]},
  G: {bass: 43, tones: [50, 55, 59, 62, 67]}, Gm: {bass: 43, tones: [50, 55, 58, 62, 67]},
} satisfies Record<string, Chord>;
/** The chord as a sustained string voicing: bass an octave down, tones on top. */
const bowed = (chord: Chord, top = 3) => [chord.bass - 12, chord.bass, ...chord.tones.slice(-top)];

const PRELUDE = [0, 1, 2, 3, 4, 2, 3, 4];
const OSTINATO = [0, 2, 4, 2];

export function composeNocturne(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;

  // ── You build agents: one open E♭ chord, and a single high G left ringing.
  rolled(mix, u2.agentEnter + .02, [39, 51, 58], .34, PIANO, {length: 4.6, bright: .45, spread: .03});
  piano(mix, g(1.5), 79, .36, {...PIANO, pan: .25}, {length: 3.4, bright: .5});

  // ── Every time it runs, it leaves a trace: a prelude in running 16ths, the trace itself.
  const streamFrom = at(u2.stream.at), failBeat = (u2.failure - g(0)) / .5;
  const stream: Progression = [[streamFrom, C.Eb], [streamFrom + 2, C.BbD], [streamFrom + 4, C.Cm7]];
  figure(mix, g, streamFrom, failBeat, stream, {
    step: .25, pattern: PRELUDE, route: PIANO, bright: .55, length: .9,
    velocity: beat => .26 + .14 * (beat - streamFrom) / (failBeat - streamFrom), bass: {velocity: .4, length: 2.2},
  });
  // Faint telemetry above it: the data the trace is made of.
  for (let beat = streamFrom + .5; beat < failBeat - .25; beat += .25) {
    if (mix.random() > .34) continue;
    const tones = stream[Math.min(2, Math.floor((beat - streamFrom) / 2))][1].tones;
    beep(mix, g(beat), tones[Math.floor(mix.random() * tones.length)] + 36, .1, {...DATA, pan: (mix.random() - .5) * 1.2}, {length: .03});
  }

  // ── When your agent fails: the prelude breaks off onto the minor subdominant.
  rolled(mix, u2.failure, [36, 48], .5, PIANO, {length: 3.6, bright: .35, spread: .006});
  rolled(mix, u2.failure + .05, [59, 63, 68], .3, PIANO, {length: 2.6, bright: .35});
  strings(mix, u2.failure, u2.backtrack.at + .5, [24, 36, 43], STRINGS, {attack: .7, release: 1.2, dynamics: [.5, .85], bright: .2, level: .9});
  melody(mix, g, [[at(u2.upwardTurn.at) + .5, 60, 1], [at(u2.upwardTurn.at) + 1.5, 63, 1], [at(u2.upwardTurn.at) + 2.5, 65, 1.5]], {...CLOSE, pan: .1}, {velocity: .3, bright: .4});

  // ── The trace can tell you why: rewind, then three drawers spell out C minor 9.
  [79, 75, 72, 67, 63, 60, 55, 51].forEach((midi, i) => piano(mix, u2.backtrack.at + i * .055, midi, .3 - i * .02, {...CLOSE, pan: .3 - i * .08}, {length: .8, bright: .5}));
  rolled(mix, u2.drawers[0], [36, 48, 55], .34, PIANO, {length: 5, bright: .35});
  u2.drawers.forEach((time, i) => piano(mix, time, [67, 70, 74][i], .38 + i * .05, {...PIANO, pan: -.2 + i * .2}, {length: 3.2, bright: .5}));
  strings(mix, u2.backtrack.at + .3, u2.highlight.at + .4, bowed(C.Cm9, 2), STRINGS, {attack: 1.4, release: 1, dynamics: [.3, .55], bright: .3, level: .8});
  rolled(mix, u2.highlight.at, [44, 51, 55, 60], .34, PIANO, {length: 3, bright: .4});
  strings(mix, u2.highlight.at, u2.insights + .3, bowed(C.Ab, 3), STRINGS, {attack: .8, release: 1, dynamics: [.5, .4], bright: .35, level: .8});

  // ── The insights are hidden across thousands of traces: strings open and the theme is first spoken.
  const insights = at(u2.insights, 1), ifOnly = at(u2.ifOnly, 1);
  const hidden: Progression = [[insights, C.Ab], [insights + 2, C.EbG], [insights + 4, C.Fm9], [insights + 6, C.Bb7sus]];
  figure(mix, g, insights, ifOnly, hidden, {step: .5, pattern: [0, 2, 1, 3], route: PIANO, bright: .45, length: 1.4,
    velocity: beat => .24 + .1 * Math.sin(Math.PI * (beat - insights) / (ifOnly - insights)), bass: {velocity: .42, length: 2.4}});
  hidden.forEach(([beat, chord], i) => strings(mix, g(beat), g(i < 3 ? hidden[i + 1][0] : ifOnly) + .05, bowed(chord), STRINGS,
    {attack: i ? .35 : 1.2, release: .9, dynamics: [[.35, .6], [.6, .85], [.85, 1], [1, .6]][i] as [number, number], bright: .5}));
  melody(mix, g, [[insights + 1, 67, 1], [insights + 2, 70, 1], [insights + 3, 75, 1.5], [insights + 4.5, 74, .5], [insights + 5, 72, 2], [insights + 7, 70, 2]],
    {...PIANO, pan: .15}, {velocity: .48, bright: .6});

  // ── If only someone could read them all: an unresolved A♭maj9♯11 — the question hangs.
  rolled(mix, g(ifOnly), [44, 51, 58, 67, 74], .32, PIANO, {length: 4, bright: .45, spread: .04});
  strings(mix, g(ifOnly), g(ifOnly + 2.5), [32, 44, 51, 60], STRINGS, {attack: .3, release: 1.4, dynamics: [.55, .25], bright: .3});
  piano(mix, g(ifOnly + 1.5), 86, .26, {...PIANO, pan: .3}, {length: 3, bright: .5});

  // ── Cheap LLMs read traces efficiently: a light, thin toccata high on the keyboard.
  const cheapFrom = at(cost.cloudOut.at, 1), miss = at(cost.missIssues, 1);
  const cheap: Progression = [[cheapFrom, {bass: 39, tones: [75, 79, 82, 79]}], [cheapFrom + 2, {bass: 38, tones: [74, 77, 82, 77]}], [cheapFrom + 4, {bass: 36, tones: [72, 75, 79, 75]}]];
  figure(mix, g, cheapFrom, miss, cheap, {step: .25, pattern: [0, 1, 2, 3], route: CLOSE, bright: .8, length: .16,
    velocity: () => .3, bass: {velocity: .3, length: .35, octave: true}});
  // …but fail to find crucial issues: the run trips over wrong notes and lands on a tritone.
  [[0, 79], [.25, 76], [.5, 73]].forEach(([beat, midi]) => piano(mix, g(miss + beat), midi, .36, CLOSE, {length: .3, bright: .6}));
  rolled(mix, g(miss + 1), [36, 42], .38, PIANO, {length: 2.5, bright: .3, spread: .01});
  strings(mix, g(miss + 1), cost.cameraToBash.at + cost.cameraToBash.duration, [24, 36, 43], STRINGS, {attack: 1.2, release: .6, dynamics: [.2, .6], bright: .15, level: .8});

  // ── Powerful LLMs find deep issues: the floor drops to C minor, octaves in the bass, deliberate.
  const heavyFrom = Math.ceil(at(cost.powerful)), budgetBeat = at(cost.cameraToBudget.at, 1);
  const heavy: Progression = [[heavyFrom, C.Cm], [heavyFrom + 2, {bass: 44, tones: [48, 60, 63, 68]}], [heavyFrom + 4, {bass: 41, tones: [48, 60, 65, 68]}], [heavyFrom + 6, C.G]];
  for (let beat = heavyFrom; beat < budgetBeat; beat += 2) {
    const [, chord] = heavy[Math.min(heavy.length - 1, (beat - heavyFrom) / 2)];
    rolled(mix, g(beat), [chord.bass - 12, chord.bass], .42, PIANO, {length: 1.9, bright: .35, spread: .005});
    rolled(mix, g(beat + 1), chord.tones.slice(-3), .34, PIANO, {length: 1, bright: .4, spread: .01});
    strings(mix, g(beat), g(beat + 2) + .05, [chord.bass - 12, chord.bass, chord.tones.at(-2)!], STRINGS, {attack: .15, release: .6, dynamics: [.7, .5], bright: .3});
  }
  timpani(mix, cost.bashStop, 36, .5, DRUM);

  // ── …but the costs are unsustainable: a warm A♭ for a moment, then the budget drains down a lament bass.
  const drain = cost.depletion, drainBeat = at(drain.at, 1);
  rolled(mix, g(budgetBeat), [44, 51, 60, 67, 72], .36, PIANO, {length: 3, bright: .45});
  strings(mix, g(budgetBeat), g(drainBeat), bowed(C.Ab), STRINGS, {attack: .6, release: .4, dynamics: [.6, .75], bright: .45});
  const lament: [number, number[], number][] = [[36, [63, 67, 72], .5], [34, [62, 67, 70], .44], [32, [60, 65, 68], .38], [31, [59, 62, 67], .34]];
  const stepBeats = 1.5;
  lament.forEach(([bass, tones, velocity], i) => {
    const time = g(drainBeat + i * stepBeats);
    rolled(mix, time, [bass, bass + 12], velocity, PIANO, {length: i === 3 ? 5 : 1.9, bright: .3, spread: .006});
    rolled(mix, time + .06, tones, velocity * .8, PIANO, {length: i === 3 ? 4.5 : 1.8, bright: .35});
    strings(mix, time, i === 3 ? g(at(flow.entry.at, 1) - .5) : g(drainBeat + (i + 1) * stepBeats) + .05, [bass + 12, ...tones.slice(0, 2)], STRINGS,
      {attack: .25, release: i === 3 ? 1.2 : .5, dynamics: i === 3 ? [.45, .12] : [.8 - i * .12, .7 - i * .12], bright: .25});
  });

  // ── Until now. The G hangs alone; the same G becomes the third of E♭.
  const drop = at(flow.reveal, 1), entry = at(flow.entry.at, 1);
  piano(mix, g(entry - 1), 67, .28, {...PIANO, pan: .15}, {length: 3, bright: .45});
  strings(mix, g(entry), g(drop) + .02, [55, 67], STRINGS, {attack: .9, release: .15, dynamics: [.1, 1], bright: .6});
  [63, 67, 70, 75, 79, 82, 87, 91].forEach((midi, i) => beep(mix, g(drop - 1) + i * .0625, midi + 12, .06 + i * .012, {...DATA, pan: -.4 + i * .11}, {length: .05}));

  // ── Introducing Flow-1: E♭ at last, the full theme sung in octaves.
  timpani(mix, flow.reveal, 39, .62, DRUM, {decay: 2});
  rolled(mix, flow.reveal, [39, 51], .78, PIANO, {length: 6, bright: .5, spread: .004});
  rolled(mix, flow.reveal + .03, [58, 63, 67, 70], .55, PIANO, {length: 4.5, bright: .55});
  const sung: Progression = [[drop, C.Eb], [drop + 2, C.Cm], [drop + 4, C.Ab], [drop + 6, C.Bb]];
  sung.forEach(([beat, chord], i) => strings(mix, g(beat), g(beat + 2) + .05, [chord.bass - 12, chord.bass, ...chord.tones.slice(-3), chord.tones.at(-1)! + 12], STRINGS,
    {attack: i ? .3 : .05, release: .7, dynamics: [[1, .8], [.8, .75], [.75, .8], [.8, .85]][i] as [number, number], bright: .7}));
  figure(mix, g, drop + 2, drop + 8, sung, {step: .5, pattern: [0, 2, 3, 2], route: PIANO, bright: .5, length: 1.2, velocity: () => .32, bass: {velocity: .5, length: 2}});
  melody(mix, g, [[drop + 1, 79, 1], [drop + 2, 82, 1], [drop + 3, 87, 1.5], [drop + 4.5, 86, .5], [drop + 5, 84, 1], [drop + 6, 82, 2]], {...PIANO, pan: .2}, {velocity: .58, octave: true, bright: .65});

  // ── Matching Sonnet-5 at 2% of the cost: a Glass-like ostinato, the harmony lifting on "2%".
  const pulse = drop + 8, swap = at(flow.numberSwap.at, 1), signals = at(flow.cameraToEngine.at, 1), shut = flow.coverShut;
  const shutBeat = (shut - g(0)) / .5;
  const bench = progression([pulse, C.Eb], [pulse + 2, C.BbD], [pulse + 4, C.Cm7], [swap, C.Ab], [swap + 2, C.Bb], [swap + 4, C.EbG], [signals, C.Cm], [signals + 2, C.Ab]);
  figure(mix, g, pulse, shutBeat, bench, {step: .25, pattern: OSTINATO, route: CLOSE, bright: .55, length: .5,
    velocity: beat => .24 + .12 * (beat - pulse) / (shutBeat - pulse), bass: {velocity: .48, length: 1.9, octave: true}});
  bench.forEach(([beat, chord], i) => strings(mix, g(beat), g(i + 1 < bench.length ? bench[i + 1][0] : shutBeat) + .05, bowed(chord, 2), STRINGS,
    {attack: .25, release: .5, dynamics: [.45 + i * .04, .5 + i * .04], bright: .5, level: .8}));
  // The bars grow: one bright scale up the keyboard, landing on high E♭.
  const scale = [63, 65, 67, 68, 70, 72, 74, 75, 77, 79, 80, 82, 84, 86, 87];
  scale.forEach((midi, i) => piano(mix, flow.barsGrow.at + flow.barsGrow.duration * (i / (scale.length - 1)) ** 1.15, midi, .3 + i * .016, {...CLOSE, pan: -.4 + i * .055}, {length: i === scale.length - 1 ? 2.6 : .5, bright: .7}));
  // Flow-1 powers Signals: the theme climbs in octaves over the engine, the door closes on B♭.
  melody(mix, g, [[signals, 75, 1], [signals + 1, 77, 1], [signals + 2, 79, .5], [signals + 2.5, 80, .5]], {...PIANO, pan: .2}, {velocity: .5, octave: true, bright: .6});
  timpani(mix, shut, 34, .6, DRUM);
  rolled(mix, shut, [34, 46, 53, 58, 63, 65], .5, PIANO, {length: 4, bright: .45, spread: .012});
  strings(mix, shut, issues.native + .1, [34, 46, 53, 58, 65], STRINGS, {attack: .05, release: 1, dynamics: [.7, .2], bright: .4});

  // ── It finds deep issues, in every trace: a harp-like run through the appearing triangles.
  const pentatonic = [63, 65, 67, 70, 72, 75, 77, 79, 82, 84, 87];
  issues.pops.forEach((pop, i) => {
    if (i % 3) return;
    const midi = pentatonic[Math.min(pentatonic.length - 1, Math.floor(pop.height * pentatonic.length))];
    piano(mix, pop.at, midi, .24 + mix.random() * .08, {...PIANO, pan: pop.pan * .8}, {length: 1.6, bright: .55});
  });
  rolled(mix, issues.native, [39, 51, 58], .36, PIANO, {length: 3, bright: .4});

  // …and clusters them into high-level patterns: motion returns, rising into the lock.
  const lock = issues.clusters[0], lockBeat = (lock - g(0)) / .5;
  const gather = Math.ceil(at(issues.travel.at));
  const patterns = progression([gather, C.Ab], [gather + 2, C.Bb7sus], [lockBeat, C.Eb], [lockBeat + 2.5, C.Ab], [lockBeat + 4.5, C.Bb7sus]);
  figure(mix, g, gather, at(end.start, 1), patterns, {step: .5, pattern: [0, 2, 3, 4, 3, 2], route: PIANO, bright: .5, length: 1.1,
    velocity: beat => beat < lockBeat ? .24 + .1 * (beat - gather) / (lockBeat - gather) : .26, bass: {velocity: .42, length: 2.2}});
  strings(mix, g(gather), lock + .02, [32, 44, 51, 60, 63], STRINGS, {attack: 1.2, release: .2, dynamics: [.25, .85], bright: .5});
  rolled(mix, lock, [39, 51, 58, 63, 67, 70], .48, PIANO, {length: 4, bright: .55});
  // Ready for you or your coding agent: the room settles, warm and close.
  strings(mix, lock, g(at(end.start, 1)) + .1, [39, 51, 58, 67], STRINGS, {attack: .1, release: .8, dynamics: [.75, .45], bright: .45});
  melody(mix, g, [[lockBeat + 2.5, 72, 1.5], [lockBeat + 4, 70, 1], [lockBeat + 5, 67, 2]], {...PIANO, pan: .2}, {velocity: .36, bright: .5});

  // ── Unlock the insights hiding in millions of traces: IV → V, and the theme's D waits for the logo.
  const unlock = at(end.start, 1), logo = end.logo, logoBeat = (logo - g(0)) / .5;
  const build: Progression = [[unlock, C.Ab], [unlock + 2, C.Bb]];
  figure(mix, g, unlock, logoBeat, build, {step: .25, pattern: OSTINATO, route: PIANO, bright: .55, length: .6,
    velocity: beat => .26 + .16 * (beat - unlock) / (logoBeat - unlock), bass: {velocity: .52, length: 2, octave: true}});
  build.forEach(([beat, chord], i) => strings(mix, g(beat), g(beat + 2) + .03, bowed(chord), STRINGS, {attack: .3, release: .15, dynamics: i ? [.7, 1] : [.45, .7], bright: .6}));
  melody(mix, g, [[unlock, 67, 1], [unlock + 1, 70, 1], [unlock + 2, 75, 1.5], [unlock + 3.5, 74, .5]], {...PIANO, pan: .2}, {velocity: .55, octave: true, bright: .6});
  for (let beat = logoBeat - 2; beat < logoBeat; beat += .125) timpani(mix, g(beat), 34, .08 + .3 * ((beat - logoBeat + 2) / 2) ** 2, DRUM, {decay: .5});

  // ── With Laminar: D → E♭. The whole instrument answers, then high E♭–G–B♭ glints as it fades.
  timpani(mix, logo, 39, .6, DRUM, {decay: 2.2});
  rolled(mix, logo, [39, 51], .72, PIANO, {length: end.end - logo + .4, bright: .5, spread: .004});
  rolled(mix, logo + .025, [58, 63, 67, 75, 87], .56, PIANO, {length: end.end - logo, bright: .6, spread: .02});
  strings(mix, logo, end.end - 1.1, [27, 39, 51, 58, 63, 67, 70, 75], STRINGS, {attack: .06, release: 1.1, dynamics: [1, .25], bright: .7});
  [[1.1, 87], [1.45, 91], [1.8, 94]].forEach(([delay, midi], i) => piano(mix, logo + delay, midi, .24 - i * .03, {...PIANO, pan: -.2 + i * .25}, {length: 2.2, bright: .5}));
}
