import type {ScoreCues} from '../cues';
import {clamp} from '../dsp';
import {beatOf, gridOf} from '../style';
import {bowed, piano, type Mix, type Route} from '../voices';
import {humanize, legato, rolled} from '../writing';

/*
 * "Phase" — G major, after Steve Reich. Two pianos play one twelve-note pattern: the run, and the
 * trace it leaves. When the agent fails the second piano drifts out of phase, then locks a note ahead
 * so a new resultant pattern appears: the why. The cheap model plays the pattern with holes (the
 * issues it misses), the powerful one at half speed; the budget erodes it note by note until one B is
 * left, the third of G for Flow-1. In Issues the pianos phase back into unison as the clusters lock.
 */

const LEFT: Route = {bus: 'music', pan: -.4, hall: .22, room: .14};
const RIGHT: Route = {bus: 'music', pan: .4, hall: .22, room: .14};
const LOW: Route = {bus: 'music', hall: .34, room: .06};
const SECTION: Route = {bus: 'music', hall: .34, room: .08};
const SOLO: Route = {bus: 'music', hall: .38, room: .06, pan: .1};

// G major pentatonic, so any offset between the two pianos stays consonant.
const PATTERN = [67, 71, 74, 76, 71, 69, 74, 76, 67, 71, 69, 74];
// The cheap model's pattern loses its Es and As: the issues it fails to find.
const HOLES = new Set([3, 5, 7, 10]);
// A string chord: celli take the bass pair, violins the top.
type Voicing = {celli: readonly number[]; violins: readonly number[]};
const V = {
  G: {celli: [43, 50], violins: [67, 71, 74]}, Em: {celli: [40, 47], violins: [67, 71, 76]},
  C: {celli: [36, 43], violins: [64, 67, 71]}, Am: {celli: [45, 52], violins: [64, 69, 72]},
  D: {celli: [38, 45], violins: [66, 69, 74]}, GD: {celli: [38, 43], violins: [67, 71, 74]},
  CE: {celli: [36, 43], violins: [67, 72, 76]}, B: {celli: [35, 47], violins: [66, 71, 75]},
} satisfies Record<string, Voicing>;

/** Piecewise drift in pattern steps; between keyframes it eases, and that easing is the audible phasing. */
const drift = (...keys: [beat: number, steps: number][]) => (beat: number) => {
  if (beat <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (beat < keys[i][0]) {
    const [b0, s0] = keys[i - 1], [b1, s1] = keys[i], x = clamp((beat - b0) / Math.max(1e-6, b1 - b0));
    return s0 + (s1 - s0) * x * x * (3 - 2 * x);
  }
  return keys.at(-1)![1];
};

type Player = {
  route: Route; velocity: (beat: number) => number;
  /** Pattern steps ahead of the grid: integers are locked offsets, fractions are mid-phase. */
  ahead?: (beat: number) => number;
  /** The note for pattern step k (null rests), transposed or eroded per section. */
  note?: (k: number, beat: number) => number | null;
  step?: number; length?: number; bright?: number;
};

export function composePhase(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;

  /** Step k sits at k·step beats from beat 0, so both pianos share one pattern phase all film long. */
  const play = (from: number, to: number, player: Player) => {
    const step = player.step ?? .25;
    for (let k = Math.ceil(from / step - 1e-9); k * step < to - 1e-9; k++) {
      const beat = k * step, midi = player.note ? player.note(k, beat) : PATTERN[k % 12];
      if (midi === null) continue;
      const [time, velocity] = humanize(mix, g(beat) - (player.ahead?.(beat) ?? 0) * step * .5, player.velocity(beat) * (k % 3 ? .88 : 1));
      piano(mix, time, midi, velocity, player.route, {length: player.length ?? .45, bright: player.bright ?? .55});
    }
  };
  /** Bowed eighths on every chord tone, breathing in one swell across the span (Music for 18 Musicians). */
  const pulse = (from: number, to: number, voicing: Voicing, level = 1) => {
    for (let beat = from; beat < to - 1e-9; beat += .5) {
      const breath = Math.sin(Math.PI * clamp((beat - from + .25) / (to - from)));
      voicing.violins.forEach((midi, i) => bowed(mix, g(beat), g(beat) + .2, midi, {...SECTION, pan: -.2 + .25 * i},
        {section: 'violins', dynamics: [.3 + .55 * breath, .25 + .5 * breath], attack: .015, release: .09, level: level * .42}));
    }
    hold(from, to, {celli: voicing.celli, violins: []}, [.35, .6], level);
  };
  const hold = (from: number, to: number, voicing: Voicing, dynamics: [number, number], level = 1, release = .7) => {
    voicing.celli.forEach((midi, i) => bowed(mix, g(from), g(to), midi, {...SECTION, pan: -.4 + .1 * i}, {section: 'celli', dynamics, attack: .35, release, level: level * .5}));
    voicing.violins.forEach((midi, i) => bowed(mix, g(from), g(to), midi, {...SECTION, pan: -.1 + .25 * i}, {section: 'violins', dynamics, attack: .35, release, level: level * .38}));
  };

  // ── You build agents: an open G, and one piano starts the pattern alone.
  const stream = at(u2.stream.at, 1), fail = at(u2.failure, 1), back = at(u2.backtrack.at, 1), insights = at(u2.insights, 1);
  const collapse = at(u2.collapse.at), cloud = at(u2.cloudIn.at, 1), ifOnly = at(u2.ifOnly, 1);
  rolled(mix, u2.agentEnter + .02, [31, 43, 50], .36, LOW, {length: 5, bright: .4, spread: .03});
  play(1, ifOnly, {route: LEFT, velocity: beat => .2 + .1 * clamp((beat - 1) / (stream - 1))});

  // ── Every time it runs, it leaves a trace: the second piano joins in unison. When it fails it drifts
  // out of phase, and the trace locks one step ahead: a new pattern that tells you why.
  const ahead = drift([fail, 0], [back, 1], [collapse, 1], [cloud, 2]);
  play(stream, ifOnly, {route: RIGHT, ahead, velocity: beat => .24 + .06 * clamp((beat - stream) / (fail - stream))});
  hold(stream, fail, {celli: [43, 50], violins: []}, [.2, .45]);
  hold(fail, back + 1, V.Em, [.5, .3], .8);
  legato(mix, g, [[fail, 79, 1.5, [.6, .45]], [fail + 1.5, 78, 2.5, [.45, .25]]], SOLO);
  u2.drawers.forEach((time, i) => bowed(mix, time, time + .7, [71, 74, 79][i], {...SOLO, pan: -.1 + .15 * i}, {dynamics: [.45 + .08 * i, .35], attack: .04, release: .5, level: .8}));
  hold(at(u2.highlight.at, 1), insights, V.C, [.3, .5], .8);

  // ── The insights are hidden across thousands of traces: the strings pulse under the resultant patterns.
  pulse(insights, insights + 2, V.C);
  pulse(insights + 2, insights + 4, V.Am);
  pulse(insights + 4, cloud, V.Em);
  pulse(cloud, ifOnly, V.D, .9);
  // ── If only someone could read them all: the pianos stop on an open Cmaj7♯11.
  hold(ifOnly, ifOnly + 2.5, {celli: [36, 43], violins: [64, 71]}, [.45, .15], .9, 1.4);
  bowed(mix, g(ifOnly), g(ifOnly + 2.5), 78, {...SOLO, pan: .25}, {dynamics: [.3, .15], attack: .3, release: 1.2, level: .6});
  piano(mix, g(ifOnly + .5), 90, .24, {...LOW, pan: .3}, {length: 3, bright: .5});

  // ── Cheap LLMs read traces efficiently: one piano, an octave up and staccato, a thin violin above.
  const cheap = at(cost.cloudOut.at, 1), miss = at(cost.missIssues, 1), bash = at(cost.cameraToBash.at, 1);
  play(cheap, miss, {route: LEFT, note: k => PATTERN[k % 12] + 12, velocity: () => .26, length: .12, bright: .8});
  bowed(mix, g(cheap), g(miss), 83, {...SOLO, pan: .3}, {dynamics: [.15, .3], attack: .5, release: .3, level: .5});
  // …but fail to find crucial issues: the same pattern with holes where the Es and As were.
  play(miss, bash, {route: LEFT, note: k => HOLES.has(k % 12) ? null : PATTERN[k % 12] + 12, velocity: beat => .26 * (1 - .5 * clamp((beat - miss) / (bash - miss))), length: .12, bright: .8});
  rolled(mix, g(miss), [36, 42], .36, LOW, {length: 2.5, bright: .3, spread: .01});
  hold(miss, bash + 1, {celli: [36, 42], violins: []}, [.2, .5], .8);

  // ── Powerful LLMs find deep issues: both pianos at half speed, two octaves down, over heavy celli.
  const heavy = Math.ceil(at(cost.powerful)), budget = at(cost.cameraToBudget.at, 1);
  play(heavy, budget, {route: LEFT, step: .5, note: k => PATTERN[k % 12] - 24, velocity: () => .42, length: 1, bright: .35});
  play(heavy, budget, {route: RIGHT, step: .5, note: k => PATTERN[k % 12] - 12, velocity: () => .34, length: .9, bright: .4});
  const deep: [number, Voicing][] = [[heavy, V.Em], [heavy + 2, V.C], [heavy + 4, V.Am], [heavy + 6, V.Em]];
  deep.forEach(([beat, voicing], i) => {
    for (let b = beat; b < Math.min(budget, beat + 2) - 1e-9; b += 1) voicing.celli.forEach(midi =>
      bowed(mix, g(b), g(b) + .42, midi - (b === beat ? 12 : 0), {...SECTION, pan: -.35}, {section: 'celli', dynamics: [.95, .75], attack: .01, release: .15, level: b === beat ? .7 : .5}));
    hold(beat, Math.min(budget, i + 1 < deep.length ? deep[i + 1][0] : budget), {celli: [], violins: voicing.violins}, [.45, .6], .8, .4);
  });
  rolled(mix, cost.bashStop, [28, 40], .5, LOW, {length: 2.2, bright: .3, spread: .005});

  // ── …but the costs are unsustainable: a warm C, then the budget erodes the pattern down a lament bass.
  const drain = at(cost.depletion.at, 1), entry = at(flow.entry.at, 1), drop = at(flow.reveal, 1), step = 1.5;
  rolled(mix, g(budget), [36, 43, 52, 59, 64], .36, LOW, {length: 3, bright: .45});
  hold(budget, drain, V.C, [.45, .6], .9, .4);
  // A, E, D, then G drop out one per lament chord; B, the pivot into G, is the last note standing.
  const lost = [69, 76, 74, 67];
  play(at(cost.budgetAppear, 1), drop - 1, {route: LEFT, velocity: beat => .3 + .08 * clamp((beat - drain - 4.5) / 4),
    note: (k, beat) => lost.slice(0, clamp(Math.floor((beat - drain) / step) + 1, 0, 4)).includes(PATTERN[k % 12]) ? null : PATTERN[k % 12]});
  [V.Em, V.GD, V.CE, V.B].forEach((voicing, i) => hold(drain + i * step, i === 3 ? entry : drain + (i + 1) * step + .1, voicing, i === 3 ? [.55, .4] : [.6 - i * .05, .55 - i * .05], .9, i === 3 ? 1 : .3));

  // ── Until now. B alone, on the violin and the last of the pattern, swelling; then a run into the drop.
  legato(mix, g, [[entry, 83, drop - entry, [.2, .95]]], SOLO, {release: .15, level: 1.2});
  hold(entry, drop, {celli: [47], violins: [71]}, [.15, .7], .9, .2);
  [67, 71, 74, 79, 83, 86, 91].forEach((midi, i) => piano(mix, g(drop - 1) + i * .07, midi, .16 + i * .03, {...RIGHT, pan: -.4 + i * .13}, {length: 1, bright: .6}));

  // ── Introducing Flow-1: G at last. Both pianos lock in octaves, the strings pulse, the violin sings long tones.
  const bench = at(flow.benchmark, 1), swap = at(flow.numberSwap.at, 1), bars = at(flow.barsGrow.at), engine = at(flow.cameraToEngine.at, 1);
  const module = at(flow.moduleActivation), shut = flow.coverShut, shutBeat = at(shut);
  rolled(mix, flow.reveal, [31, 43, 50], .7, LOW, {length: 5, bright: .5, spread: .004});
  rolled(mix, flow.reveal + .02, [55, 59, 62, 67], .5, LOW, {length: 4, bright: .55});
  play(drop, shutBeat, {route: LEFT, velocity: () => .36, bright: .6});
  // The run's octave twin is locked through the benchmark, ratchets a step as the bars grow, and spins as the engine boots.
  play(drop, shutBeat, {route: RIGHT, note: k => PATTERN[k % 12] + 12, ahead: drift([bars, 0], [bars + 2, 1], [module, 1], [shutBeat, 4]), velocity: () => .3, length: .35, bright: .6});
  pulse(drop, bench, V.G, 1.1);
  pulse(bench, swap, V.Em, 1.1);
  pulse(swap, engine, V.C, 1.15);
  pulse(engine, shutBeat, V.D, 1.2);
  legato(mix, g, [[drop, 83, 3, [.55, .7]], [drop + 3, 81, 1, .6], [drop + 4, 79, bench - drop - 4, [.6, .5]], [bench, 83, 2, .6], [bench + 2, 86, swap - bench - 2, [.6, .7]],
    [swap, 88, engine - swap - 1, [.65, .8]], [engine - 1, 86, 1, .7], [engine, 81, module - engine, .7], [module, 90, shutBeat - module, [.7, .9]]], SOLO);
  // Flow-1 powers Signals: the door shuts on a full G.
  rolled(mix, shut, [31, 43, 50, 55, 59, 62, 67], .56, LOW, {length: 4, bright: .5, spread: .012});
  hold(shutBeat, at(issues.native, 1) + .5, V.G, [.75, .2], 1, 1);
  bowed(mix, shut, shut + 2.5, 91, {...SOLO, pan: .2}, {dynamics: [.8, .3], attack: .02, release: 1, level: .7});

  // ── It finds deep issues, in every trace: every other triangle rings a note by its height.
  const pentatonic = [67, 69, 71, 74, 76, 79, 81, 83, 86, 88, 91];
  issues.pops.forEach((pop, i) => {
    if (i % 2) return;
    piano(mix, pop.at, pentatonic[Math.min(pentatonic.length - 1, Math.floor(pop.height * pentatonic.length))], .22 + mix.random() * .08, {...LOW, pan: pop.pan * .8}, {length: 1.4, bright: .6});
  });
  // …and clusters them into high-level patterns: the pianos start half a cycle apart and phase back into unison on the lock.
  const travel = at(issues.travel.at), lock = issues.clusters[0], lockBeat = at(lock), finish = at(end.start, 1);
  play(travel, finish, {route: LEFT, velocity: beat => beat < lockBeat ? .24 + .08 * clamp((beat - travel) / (lockBeat - travel)) : .26});
  play(travel, finish, {route: RIGHT, ahead: drift([travel, 6], [lockBeat, 0]), velocity: beat => beat < lockBeat ? .22 + .08 * clamp((beat - travel) / (lockBeat - travel)) : .22});
  hold(travel, travel + 2.5, V.C, [.25, .5], .8, .3);
  hold(travel + 2.5, lockBeat, V.D, [.5, .8], .9, .2);
  rolled(mix, lock, [31, 43, 50, 55, 59, 62], .5, LOW, {length: 4, bright: .55});
  // Ready for you or your coding agent: settled, the violin answers from above.
  hold(lockBeat, finish, V.G, [.7, .4], .9, .6);
  legato(mix, g, [[lockBeat + 1, 79, 2, .45], [lockBeat + 3, 81, 1, .45], [lockBeat + 4, 83, finish - lockBeat - 4, [.5, .35]]], SOLO);

  // ── Unlock the insights hiding in millions of traces: IV → V, both pianos in unison, rising to the logo.
  const logo = end.logo, logoBeat = at(logo);
  play(finish, logoBeat, {route: LEFT, velocity: beat => .28 + .14 * clamp((beat - finish) / (logoBeat - finish))});
  play(finish, logoBeat, {route: RIGHT, note: k => PATTERN[k % 12] + 12, velocity: beat => .22 + .12 * clamp((beat - finish) / (logoBeat - finish)), length: .35});
  pulse(finish, finish + 2, V.C, 1.1);
  pulse(finish + 2, logoBeat, V.D, 1.25);
  legato(mix, g, [[finish, 83, 2, [.55, .65]], [finish + 2, 86, 1.5, .7], [finish + 3.5, 88, .5, .75]], SOLO);

  // ── With Laminar: G, and the pattern's first four notes, slowly, from the top.
  rolled(mix, logo, [31, 43], .72, LOW, {length: end.end - logo + .4, bright: .5, spread: .004});
  rolled(mix, logo + .025, [55, 59, 62, 67, 71], .52, LOW, {length: end.end - logo, bright: .6, spread: .02});
  hold(logoBeat, at(end.end) - 2, {celli: [31, 43], violins: [67, 71, 74]}, [.9, .2], 1.1, 1.1);
  legato(mix, g, [[logoBeat, 91, 3, [.75, .3]]], SOLO, {release: 1.2});
  PATTERN.slice(0, 4).forEach((midi, i) => piano(mix, logo + 1.1 + i * .3, midi + 12, .22 - i * .02, {...LOW, pan: -.2 + i * .15}, {length: 2.2, bright: .5}));
}
