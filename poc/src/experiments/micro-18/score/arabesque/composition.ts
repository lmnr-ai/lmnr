import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bass, beep, piano, type Mix, type Route} from '../voices';
import {figure, melody, progression, rolled, type Chord, type Progression} from '../writing';

/*
 * "Arabesque" — E major, solo piano in the impressionist manner, with a sine sub and delay echoes
 * as the only electronics. The trace is a flowing triplet arabesque; failure melts it into a
 * whole-tone blur; the hidden insights are low parallel chords, a sunken cathedral. Cheap models are
 * shallow staccato up high, powerful ones massive low octaves, and the cost is the arabesque slowing
 * until one B is left. Flow-1 sweeps both hands across the keyboard. The theme (G♯–B–F♯–E–D♯)
 * leaves its D♯ hanging until the logo lands on E.
 */

const PIANO: Route = {bus: 'music', hall: .44, room: .04};
const CLOSE: Route = {bus: 'music', hall: .24, room: .08};
const ECHO: Route = {bus: 'music', hall: .36, delay: .32};
const SUB: Route = {bus: 'music', gain: .9};
const DATA: Route = {bus: 'music', gain: .7, hall: .3, delay: .35};

const C = {
  E: {bass: 40, tones: [52, 59, 63, 66, 68, 71, 75, 78]}, Csm: {bass: 37, tones: [49, 56, 59, 63, 64, 68, 71, 75]},
  A: {bass: 45, tones: [52, 57, 61, 64, 68, 71, 73, 76]}, Bsus: {bass: 47, tones: [54, 57, 61, 64, 66, 69, 73, 76]},
  Gsm: {bass: 44, tones: [51, 56, 59, 63, 66, 68, 71, 75]}, Fsm: {bass: 42, tones: [54, 57, 61, 64, 68, 69, 73, 76]},
  B: {bass: 47, tones: [54, 59, 63, 66, 69, 71, 75, 78]}, ES: {bass: 44, tones: [52, 56, 59, 63, 66, 71, 75, 78]},
} satisfies Record<string, Chord>;
/** Up-and-over contour through eight chord tones: the arabesque. */
const ARABESQUE = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3];
const TRIPLET = 1 / 3;
const WHOLE_TONE = [48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76];

/** A sub-bass swell under a chord change: the one electronic body in the score. */
const sub = (mix: Mix, time: number, midi: number, duration: number, velocity: number, glide = 0) => bass(mix, time, midi, duration, velocity, SUB, {glide, drive: 1.1});

export function composeArabesque(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;

  // ── You build agents: an E major 9 unfurls upward, one B left shimmering in the echo.
  [40, 47, 54, 56, 63, 66, 71].forEach((midi, i) => piano(mix, u2.agentEnter + .02 + i * .07, midi, .34 - i * .015, {...PIANO, pan: -.35 + i * .1}, {length: 4.5, bright: .45}));
  piano(mix, g(2), 83, .3, {...ECHO, pan: .3}, {length: 3, bright: .5});
  sub(mix, u2.agentEnter, 28, 1.8, .22);

  // ── Every time it runs, it leaves a trace: a triplet arabesque, rising and falling like a line of thought.
  const streamFrom = at(u2.stream.at), failBeat = (u2.failure - g(0)) / .5;
  const stream: Progression = [[streamFrom, C.E], [streamFrom + 2, C.Csm], [streamFrom + 4, C.A]];
  figure(mix, g, streamFrom, failBeat, stream, {step: TRIPLET, pattern: ARABESQUE, route: PIANO, bright: .5, length: .8,
    velocity: beat => .24 + .14 * (beat - streamFrom) / (failBeat - streamFrom), bass: {velocity: .38, length: 2.4}});
  for (let beat = streamFrom + 1; beat < failBeat - .5; beat += 1) beep(mix, g(beat) + .02, [87, 90, 92, 95][Math.floor(mix.random() * 4)], .08, {...DATA, pan: (mix.random() - .5) * 1.2}, {length: .03});

  // ── When your agent fails: the harmony melts into a whole-tone blur, the sub sags beneath it.
  rolled(mix, u2.failure, [36, 48], .44, PIANO, {length: 4, bright: .3, spread: .008});
  sub(mix, u2.failure, 36, 1.4, .3, 2);
  WHOLE_TONE.slice(3, 13).forEach((midi, i) => piano(mix, u2.failure + .04 + i * .045, midi, .28 - i * .012, {...PIANO, pan: -.3 + i * .07}, {length: 2.8, bright: .35}));
  // A tentative climb, still on the whole-tone scale — it cannot find its footing.
  const turn = at(u2.upwardTurn.at);
  melody(mix, g, [[turn + .5, 66, 1], [turn + 1.5, 68, 1], [turn + 2.5, 70, 1.5]], {...CLOSE, pan: .1}, {velocity: .3, bright: .4});

  // ── The trace can tell you why: a pentatonic rewind, then three drawers step up E major 7.
  [92, 90, 87, 85, 83, 80, 78, 75, 73, 71].forEach((midi, i) => piano(mix, u2.backtrack.at + i * .045, midi, .28 - i * .015, {...CLOSE, pan: .35 - i * .07}, {length: .7, bright: .5}));
  rolled(mix, u2.drawers[0], [40, 52, 59], .32, PIANO, {length: 5, bright: .35});
  u2.drawers.forEach((time, i) => piano(mix, time, [68, 71, 75][i], .36 + i * .05, {...ECHO, pan: -.2 + i * .2}, {length: 3, bright: .5}));
  rolled(mix, u2.highlight.at, [45, 52, 57, 63, 68], .32, PIANO, {length: 3.4, bright: .4});

  // ── The insights are hidden across thousands of traces: a sunken cathedral of low parallel chords, the theme far above.
  const insights = at(u2.insights, 1), ifOnly = at(u2.ifOnly, 1);
  [[0, 37], [2, 35], [4, 33], [6, 35]].forEach(([beat, root], i) => {
    const time = g(insights + beat);
    rolled(mix, time, [root, root + 7, root + 12], .4 - i * .02, PIANO, {length: 3, bright: .3, spread: .004});
    rolled(mix, time + .02, [root + 19, root + 24, root + 31], .26, PIANO, {length: 2.6, bright: .4, spread: .008});
    sub(mix, time, root - 12, .9, .18);
  });
  const hidden: Progression = [[insights, C.Csm], [insights + 2, C.B], [insights + 4, C.A], [insights + 6, C.Bsus]];
  figure(mix, g, insights + .5, ifOnly, hidden, {step: 1, pattern: [4, 6, 5, 7], route: ECHO, bright: .45, length: 1.6, velocity: () => .18});
  melody(mix, g, [[insights + 1, 80, 1], [insights + 2, 83, 1], [insights + 3, 90, 1.5], [insights + 4.5, 88, .5], [insights + 5, 87, 3]], {...PIANO, pan: .2}, {velocity: .4, bright: .55});

  // ── If only someone could read them all: A major 7 ♯11, and the D♯ just hangs.
  rolled(mix, g(ifOnly), [33, 45, 52, 56, 61, 63, 68, 75], .3, PIANO, {length: 4.2, bright: .45, spread: .05});
  piano(mix, g(ifOnly + 1.5), 87, .24, {...ECHO, pan: .3}, {length: 3, bright: .5});

  // ── Cheap LLMs read traces efficiently: shallow staccato, high on the keyboard, nothing underneath.
  const cheapFrom = at(cost.cloudOut.at, 1), miss = at(cost.missIssues, 1);
  const shallow = [88, 90, 92, 95, 97, 95, 92, 90];
  for (let beat = cheapFrom, k = 0; beat < miss - 1e-9; beat += .25, k++) {
    if (k % 8 === 7) continue;
    piano(mix, g(beat) + (mix.random() - .5) * .006, shallow[k % shallow.length] - (Math.floor(k / 8) % 2 ? 2 : 0), .3 + (k % 4 ? 0 : .06), {...CLOSE, pan: .1 + .3 * Math.sin(k)}, {length: .12, bright: .8});
  }
  // …but fail to find crucial issues: the pattern smears into a cluster and drops onto a low tritone.
  [[0, [89, 90]], [.25, [86, 87]], [.5, [82, 83]]].forEach(([beat, notes]) => rolled(mix, g(miss + (beat as number)), notes as number[], .32, CLOSE, {length: .35, bright: .6, spread: .004}));
  rolled(mix, g(miss + 1), [34, 40], .38, PIANO, {length: 3, bright: .3, spread: .01});
  sub(mix, g(miss + 1), 28, 1.6, .22);

  // ── Powerful LLMs find deep issues: massive octaves in the bass, one chord per bar, deliberate.
  const heavyFrom = Math.ceil(at(cost.powerful)), budgetBeat = at(cost.cameraToBudget.at, 1);
  const heavy: Progression = [[heavyFrom, C.Csm], [heavyFrom + 2, C.A], [heavyFrom + 4, C.Fsm], [heavyFrom + 6, C.Gsm]];
  for (let beat = heavyFrom; beat < budgetBeat; beat += 2) {
    const [, chord] = heavy[Math.min(heavy.length - 1, (beat - heavyFrom) / 2)];
    const low = chord.bass - 12 < 32 ? chord.bass : chord.bass - 12;
    rolled(mix, g(beat), [low, low + 12], .62, PIANO, {length: 2.2, bright: .35, spread: .004});
    sub(mix, g(beat), low - (low === chord.bass ? 12 : 0), .8, .32);
    rolled(mix, g(beat + .5), chord.tones.slice(1, 4), .34, PIANO, {length: 1.4, bright: .4, spread: .01});
    rolled(mix, g(beat + 1), [low + 12, low + 24], .42, PIANO, {length: 1, bright: .35, spread: .004});
  }

  // ── …but the costs are unsustainable: the arabesque returns, then slows and thins until one B is left.
  const drainBeat = at(cost.depletion.at, 1), drop = at(flow.reveal, 1);
  figure(mix, g, budgetBeat, drainBeat, [[budgetBeat, C.A], [budgetBeat + 2, C.E]], {step: TRIPLET, pattern: ARABESQUE, route: PIANO, bright: .45, length: .8,
    velocity: () => .26, bass: {velocity: .36, length: 2.2}});
  sub(mix, g(budgetBeat), 33, 1.6, .2);
  const slowing: [number, Chord][] = [[TRIPLET, C.Csm], [.5, C.A], [1, C.Fsm], [2, C.Bsus]];
  let cursor = drainBeat;
  slowing.forEach(([step, chord], i) => {
    const span = 1.5, from = cursor;
    piano(mix, g(from), chord.bass, .36 - i * .05, {...PIANO, pan: -.25}, {length: 2.4, bright: .35});
    for (let k = 0; cursor < from + span - 1e-9; cursor += step, k++) {
      const tone = chord.tones[ARABESQUE[k % ARABESQUE.length] % (8 - i * 2)];
      piano(mix, g(cursor) + (mix.random() - .5) * .008, tone, .26 - i * .04, {...PIANO, pan: -.2 + .4 * (tone - 48) / 36}, {length: step * 2 + .4, bright: .45});
    }
  });
  // ── Until now: one high B, left ringing into silence; then the drop.
  piano(mix, g(cursor), 83, .36, {...ECHO, pan: .2}, {length: g(drop) - g(cursor) - .1, bright: .5});
  [64, 68, 71, 76, 80, 83, 88, 92].forEach((midi, i) => beep(mix, g(drop - 1) + i * .0625, midi + 12, .05 + i * .01, {...DATA, pan: -.4 + i * .11}, {length: .05}));

  // ── Introducing Flow-1: E major at full reach — both hands sweeping triplets, the theme in octaves on top.
  sub(mix, flow.reveal, 28, 2.4, .5);
  rolled(mix, flow.reveal, [40, 52], .78, PIANO, {length: 6, bright: .5, spread: .004});
  const sung: Progression = [[drop, C.E], [drop + 2, C.Csm], [drop + 4, C.A], [drop + 6, C.B]];
  const sweep = (from: number, to: number, chords: Progression, velocity: (beat: number) => number) => {
    const low = chords.map(([b, chord]) => [b, {bass: chord.bass, tones: [chord.bass, chord.tones[0], chord.tones[1], chord.tones[2], chord.tones[1], chord.tones[0]]}] as const);
    const high = chords.map(([b, chord]) => [b, {bass: chord.bass, tones: chord.tones.map(t => t + 12)}] as const);
    figure(mix, g, from, to, low, {step: TRIPLET, pattern: [0, 1, 2, 3, 4, 5], route: PIANO, bright: .45, length: .7, velocity: beat => velocity(beat) * .9});
    figure(mix, g, from + TRIPLET / 2, to, high, {step: TRIPLET, pattern: [2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1], route: {...PIANO, delay: .06}, bright: .55, length: .6, velocity});
  };
  sweep(drop + .5, drop + 8, sung, () => .3);
  sung.forEach(([b, chord]) => sub(mix, g(b), chord.bass - 12, .9, .3));
  melody(mix, g, [[drop + 1, 80, 1], [drop + 2, 83, 1], [drop + 3, 90, 1.5], [drop + 4.5, 88, .5], [drop + 5, 87, 1], [drop + 6, 85, 2]], {...PIANO, pan: .2}, {velocity: .6, octave: true, bright: .65});

  // ── Matching Sonnet-5 at 2% of the cost: the sweep lightens to one hand, the harmony lifting on "2%".
  const pulse = drop + 8, swap = at(flow.numberSwap.at, 1), signals = at(flow.cameraToEngine.at, 1), shut = flow.coverShut;
  const shutBeat = (shut - g(0)) / .5;
  const bench = progression([pulse, C.E], [pulse + 2, C.Gsm], [pulse + 4, C.Csm], [swap, C.A], [swap + 2, C.B], [swap + 4, C.ES], [signals, C.Csm], [signals + 2, C.A]);
  figure(mix, g, pulse, shutBeat, bench, {step: TRIPLET, pattern: ARABESQUE, route: CLOSE, bright: .5, length: .6,
    velocity: beat => .22 + .12 * (beat - pulse) / (shutBeat - pulse), bass: {velocity: .44, length: 2, octave: true}});
  bench.forEach(([b, chord]) => sub(mix, g(b), chord.bass - 12, .7, .2));
  // The bars grow: a pentatonic glissando up the keyboard into a high E.
  const glissando = [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88, 90, 92, 95, 100];
  glissando.forEach((midi, i) => piano(mix, flow.barsGrow.at + flow.barsGrow.duration * (i / (glissando.length - 1)) ** 1.15, midi, .28 + i * .014, {...CLOSE, pan: -.4 + i * .055}, {length: i === glissando.length - 1 ? 2.6 : .5, bright: .7}));
  // Flow-1 powers Signals: the theme climbs; the door closes on B, the dominant.
  melody(mix, g, [[signals, 76, 1], [signals + 1, 78, 1], [signals + 2, 80, .5], [signals + 2.5, 81, .5]], {...PIANO, pan: .2}, {velocity: .5, octave: true, bright: .6});
  rolled(mix, shut, [35, 47, 54, 57, 61, 64, 69], .5, PIANO, {length: 4, bright: .45, spread: .014});
  sub(mix, shut, 35, 1.2, .4);

  // ── It finds deep issues, in every trace: pentatonic raindrops wherever a triangle lands, echoing.
  const drops = [64, 66, 68, 71, 73, 76, 78, 80, 83, 85, 88, 90];
  issues.pops.forEach((pop, i) => {
    if (i % 2) return;
    const midi = drops[Math.min(drops.length - 1, Math.floor(pop.height * drops.length))] + 12;
    piano(mix, pop.at, midi, .2 + mix.random() * .08, {...ECHO, pan: pop.pan * .85}, {length: 1.4, bright: .55});
  });
  rolled(mix, issues.native, [40, 52, 59], .34, PIANO, {length: 3, bright: .4});

  // …and clusters them into high-level patterns: the arabesque gathers and locks onto E.
  const lock = issues.clusters[0], lockBeat = (lock - g(0)) / .5;
  const gather = Math.ceil(at(issues.travel.at));
  const patterns = progression([gather, C.A], [gather + 2, C.Bsus], [lockBeat, C.E], [lockBeat + 2.5, C.A], [lockBeat + 4.5, C.Bsus]);
  figure(mix, g, gather, at(end.start, 1), patterns, {step: TRIPLET, pattern: ARABESQUE, route: PIANO, bright: .5, length: .8,
    velocity: b => b < lockBeat ? .2 + .1 * (b - gather) / (lockBeat - gather) : .24, bass: {velocity: .4, length: 2.2}});
  rolled(mix, lock, [40, 52, 59, 63, 66, 71, 75], .46, PIANO, {length: 4, bright: .55});
  sub(mix, lock, 28, 1.6, .32);
  // Ready for you or your coding agent: the melody settles, close and warm.
  melody(mix, g, [[lockBeat + 2.5, 76, 1.5], [lockBeat + 4, 75, 1], [lockBeat + 5, 71, 2]], {...PIANO, pan: .2}, {velocity: .34, bright: .5});

  // ── Unlock the insights hiding in millions of traces: IV → V swept by both hands; the D♯ waits.
  const unlock = at(end.start, 1), logo = end.logo, logoBeat = (logo - g(0)) / .5;
  const build: Progression = [[unlock, C.A], [unlock + 2, C.B]];
  sweep(unlock, logoBeat, build, b => .24 + .16 * (b - unlock) / (logoBeat - unlock));
  build.forEach(([b, chord]) => sub(mix, g(b), chord.bass - 12, 1.8, .3));
  melody(mix, g, [[unlock, 68, 1], [unlock + 1, 71, 1], [unlock + 2, 78, 1.5], [unlock + 3.5, 75, .5]], {...PIANO, pan: .2}, {velocity: .55, octave: true, bright: .6});

  // ── With Laminar: D♯ → E. E major 9 across the whole keyboard, the sub under it, raindrops as it fades.
  sub(mix, logo, 28, end.end - logo - .6, .45);
  rolled(mix, logo, [40, 52], .72, PIANO, {length: end.end - logo + .4, bright: .5, spread: .004});
  rolled(mix, logo + .025, [59, 63, 66, 68, 76, 80, 88], .54, PIANO, {length: end.end - logo, bright: .6, spread: .022});
  [[1.1, 88], [1.4, 92], [1.7, 95], [2, 99]].forEach(([delay, midi], i) => piano(mix, logo + delay, midi, .22 - i * .03, {...ECHO, pan: -.3 + i * .2}, {length: 2, bright: .5}));
}
