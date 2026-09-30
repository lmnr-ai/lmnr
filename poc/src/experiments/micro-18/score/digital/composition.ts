import type {ScoreCues} from '../cues';
import type {Mix, Route} from '../voices';
import {cascade, chordAt, loopBars, type Chord, type Progression} from '../writing';
import {blip, block, clap, click, hat, riser, sub808, zap} from './instruments';

/*
 * "Digital, after the X reference" (LAM-2315) — D Lydian at 150 BPM, half-time.
 *
 * What makes the reference itself: an 808 sub that carries ~70% of the energy, bright-but-uncanny Lydian
 * harmony (Dmaj7♯11 against E/D and F♯m), chord blocks switched on and off with no fades, square data blips
 * in the holes, pitch-drop zaps and 16th hats at 0.1s. The arc is stop-start blocks, a dense trap section, a
 * breakdown into dead air, a steady groove, and a hard stop.
 *
 * Here: the opening is gated blocks cut by the picture (the failure is a cut to silence). Cost is the dense
 * half-time trap; the budget tape-stops into "Until now", a held breath and 100ms of dead air before the drop.
 * Flow-1 is the groove, the Signals door cuts it, the report prelude goes back to blocks and blips, the issue
 * grid brings the groove back, and "with Laminar" is one last Dmaj7♯11 over the sub.
 */

const SUB: Route = {bus: 'music', gain: 1};
const BLOCK: Route = {bus: 'music', gain: 1, room: .05};
const HIGH: Route = {bus: 'music', gain: .9, room: .08, delay: .12};
const KIT: Route = {bus: 'music', gain: 1, room: .04};
const DATA: Route = {bus: 'music', gain: .8, delay: .18};

type Voiced = Chord & {root: number};
/** Tones are the gated block's voicing; `root` is the buzzing saw an octave under the 808's note, as in the reference. */
const I: Voiced = {bass: 26, root: 26, tones: [50, 54, 57, 61, 68]};
const II: Voiced = {bass: 28, root: 28, tones: [52, 56, 59, 62, 66]};
const iii: Voiced = {bass: 30, root: 30, tones: [49, 54, 57, 61, 64]};
const V: Voiced = {bass: 33, root: 33, tones: [52, 57, 61, 64, 66]};
const LOOP = [I, II, iii, II], GROOVE = [I, II, iii, V];
/** D Lydian, high: the data blips never leave it except for the one wrong note on the miss. */
const SCALE = [74, 76, 78, 80, 81, 83, 85, 86, 88, 90, 92, 93];

export function composeDigital(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion, p = issues.prelude;
  const drop = flow.reveal, Q = .4;
  /** One 150 BPM grid whose beat 0 is the Flow-1 drop; the second groove re-anchors on the issue grid. */
  const g = (beat: number) => drop + beat * Q;
  const beatOf = (time: number) => Math.round((time - drop) / Q);
  const lydian = (step: number) => SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];

  /** A block chord from `start` to `end`, 808 underneath, switched hard at both ends. */
  const chord = (start: number, end: number, voiced: Voiced, options: {level?: number; cutoff?: [number, number]; crush?: number; sub?: number} = {}) => {
    if (end - start < .03) return;
    block(mix, start, end, voiced.tones, BLOCK, {root: voiced.root, level: options.level ?? 1, cutoff: options.cutoff, crush: options.crush});
    if (options.sub !== 0) sub808(mix, start, voiced.bass + 12, end - start, options.sub ?? .7, SUB, {drop: 12, decay: 4});
  };
  /** A run of blips `every` seconds apart walking the Lydian scale. */
  const run = (time: number, from: number, steps: number, direction: 1 | -1, every = .05, velocity = .5, length = .03) => {
    for (let i = 0; i < steps; i++) blip(mix, time + i * every, lydian(from + i * direction), velocity * (1 - i * .03), {...DATA, pan: .25 * Math.sin(i * 1.7)}, length);
  };

  /**
   * The half-time trap bar (16 sixteenths): 808 on 1, the "a" of 2 and the "and" of 3; clap on 3; hats in 16ths
   * with accents on the 8ths and a 32nd roll into the last beat of every second bar. `density` 0 is 8th hats only.
   */
  const trap = (progression: Progression, from: number, to: number, options: {density?: number; level?: number; clap?: boolean; stabs?: boolean; grid?: (beat: number) => number} = {}) => {
    const density = options.density ?? 1, level = options.level ?? 1, grid = options.grid ?? g;
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const t = grid(step / 4), s = ((step % 16) + 16) % 16, bar = Math.floor(step / 16), [, c] = chordAt(progression, step / 4), voiced = c as Voiced;
      const next = Math.min(grid(to), grid((step + 1) / 4));
      if (s === 0 || s === 7 || s === 10) sub808(mix, t, voiced.bass + (s === 10 ? 12 : 0), s === 0 ? Q * 1.7 : Q * .8, (s === 0 ? .95 : .75) * level, SUB, {drop: s === 0 ? 26 : 19});
      if (options.clap !== false && s === 8) clap(mix, t, .8 * level, {...KIT, pan: .05});
      const roll = (bar % 2 === 1) && s >= 12 && density > .5;
      if (roll) [0, .05].forEach(offset => hat(mix, t + offset, (.38 + .1 * (s - 12)) * level, {...KIT, pan: .2}));
      else if (s % 2 === 0 || density > .5) hat(mix, t, (s % 2 ? .28 : .46) * level, {...KIT, pan: s % 4 === 2 ? .25 : -.15});
      // The stabs chop the chord into gated 16ths on the syncopations; the rest of the bar is silence around the 808.
      if (options.stabs && (s === 0 || s === 3 || s === 6 || s === 11 || s === 14)) block(mix, t, Math.min(next, t + .085), voiced.tones, BLOCK, {level: .95 * level, cutoff: [1500, 900]});
    }
  };

  // ── This is the agent you've built: a Dmaj7♯11 block switched on with the picture and off before the stream.
  chord(u2.agentEnter, u2.stream.at - .06, I, {cutoff: [500, 900], sub: .75});
  blip(mix, u2.firstThinking.at + .1, 85, .4, HIGH, .04);
  blip(mix, u2.firstThinking.at + .35, 80, .3, HIGH, .04);

  // ── Every time it runs, it leaves a trace: stop-start blocks, a hole every bar filled by data blips.
  const streamEnd = u2.failure - .02, BAR = 4 * Q;
  for (let t = u2.stream.at, k = 0; t < streamEnd - .1; t += BAR, k++) {
    const hole = k % 2 ? .3 : .16, stop = Math.min(streamEnd, t + BAR - hole);
    chord(t, stop, LOOP[k % LOOP.length], {cutoff: [650, 1100], level: .9, sub: .65});
    for (let b = stop + .04; b < Math.min(streamEnd, t + BAR) - .03; b += .08) blip(mix, b, lydian(k * 2 + Math.round((b - stop) / .08)), .32, DATA, .025);
  }

  // ── When your agent fails: dead air, a falling zap and one off-key blip.
  zap(mix, u2.failure, 62, 38, .32, .9, {...BLOCK, pan: 0});
  blip(mix, u2.failure + .38, 79, .42, HIGH, .06);
  // The trace can tell you why: F♯m climbs back in (the upward turn), the backtrack rewinds down the scale.
  chord(u2.upwardTurn.at, u2.backtrack.at - .03, iii, {cutoff: [400, 1300], level: .8, sub: .6});
  run(u2.backtrack.at, 11, 10, -1, Math.min(.06, u2.backtrack.duration / 12), .45);
  u2.drawers.forEach((time, i) => { blip(mix, time, [81, 85, 88][i], .5, {...HIGH, pan: -.25 + i * .25}, .05); click(mix, time, .35, KIT); });
  // The ♯11, the reference's signature colour, on the highlight; the warning is an 808 hit under it.
  blip(mix, u2.highlight.at, 80, .5, HIGH, .09);
  sub808(mix, u2.warning, 26, .9, .8, SUB, {drop: 30});

  // ── The insights are hidden across thousands of traces: blocks come back with 8th hats; the zoom builds to 16ths.
  const insightsBeat = beatOf(u2.insights) + 1, collapse = u2.collapse.at;
  const insights = loopBars(insightsBeat, beatOf(collapse), LOOP, beatOf(collapse));
  insights.forEach(([beat, c], i) => {
    const next = i + 1 < insights.length ? insights[i + 1][0] : beatOf(collapse);
    chord(g(beat), g(next) - .12, c as Voiced, {cutoff: [600, 1200], level: .85, sub: .7});
  });
  for (let t = g(insightsBeat), k = 0; t < collapse - .05; t += t >= u2.zoom.at ? Q / 4 : Q / 2, k++) hat(mix, t, t >= u2.zoom.at ? .3 + .12 * (k % 2) : .34, {...KIT, pan: k % 2 ? .2 : -.2});
  riser(mix, u2.zoom.at + .6, collapse, 50, 74, .35, {...BLOCK, pan: 0});
  // The collapse: a hard 808 zap on the cut; an F♯m under "…across thousands of traces", dark and low.
  sub808(mix, collapse, 30, .8, .95, SUB, {drop: 30});
  chord(collapse + .6, u2.ifOnly - .1, iii, {cutoff: [300, 650], level: .7, sub: .45});
  // If only someone could read them all: dead air and the ♯11 left in the echo.
  blip(mix, u2.ifOnly + .05, 92, .45, {...HIGH, delay: .5}, .07);
  chord(u2.ifOnly + .9, cost.cloudOut.at, II, {cutoff: [350, 500], level: .5, sub: .4});

  // ── Cheap LLMs: the half-time trap; each pass is a 32nd blip run in its direction.
  const trapFrom = beatOf(cost.cloudOut.at), depletion = cost.depletion.at, trapTo = (depletion - drop) / Q;
  const cost1 = loopBars(trapFrom, trapTo, LOOP, 0);
  trap(cost1, trapFrom, trapTo, {density: 1, stabs: true});
  cost.cheapLegs.forEach(leg => run(leg.at, leg.direction === 'leftToRight' ? 0 : 9, 8, leg.direction === 'leftToRight' ? 1 : -1, leg.duration / 8, .42, .022));
  // …but fail to find crucial issues: a buffer stutter and the G♮ against the ♯11.
  const missAt = cost.missIssues + .15;
  blip(mix, missAt + .3, 79, .5, HIGH, .12);
  // Powerful LLMs: the bash window lands on a long, heavy 808 with the block wide open.
  sub808(mix, cost.bashStop, 26, 1.4, 1, SUB, {drop: 31, drive: 3.2});
  block(mix, cost.bashStop, cost.bashStop + .7, I.tones.map(t => t + 12), HIGH, {level: .5, cutoff: [3000, 1200]});
  run(cost.bashDescent.at, 11, 8, -1, cost.bashDescent.duration / 10, .3, .025);
  blip(mix, cost.budgetAppear, 88, .45, HIGH, .05);
  blip(mix, cost.budgetRun.at, 85, .35, HIGH, .04);

  // Buffer edits act on what is already written: stutter the miss, cut dead air on the bash warning.
  mix.stutter(missAt, .05, 6);
  // ── …but the costs are unsustainable: the whole track tape-stops through the depletion.
  mix.tapeStop(depletion, Math.min(cost.depletion.duration, drop - depletion - .9), 1.2);

  // ── Until now: a held breath (sub and one high A), then 100ms of dead air before the drop.
  const breath = depletion + Math.min(cost.depletion.duration, drop - depletion - .9) + .05, gap = drop - .1;
  sub808(mix, breath, 26, gap - breath, .45, SUB, {drop: 0, drive: 1.6});
  blip(mix, breath + .05, 81, .22, {...HIGH, delay: .4}, gap - breath - .1);
  riser(mix, Math.max(breath, gap - 1.2), gap, 45, 69, .4, {...BLOCK, pan: 0});

  // ── Introducing Flow-1: the groove. Stabs on the syncopations, 808 following I – II – iii – V.
  const shut = flow.coverShut, shutBeat = (shut - drop) / Q;
  const flowBars = loopBars(0, shutBeat, GROOVE, 0);
  sub808(mix, drop, 26, 1.2, 1, SUB, {drop: 34, drive: 3.4});
  block(mix, drop, drop + .9, I.tones.map(t => t + 12), HIGH, {level: .55, cutoff: [3500, 1500]});
  trap(flowBars, 0, shutBeat, {density: 1, stabs: true});
  // The bead landings climb the scale, flow-1's (the third) the highest and longest.
  flow.numberDrops.forEach((time, i) => blip(mix, time, lydian(4 + [0, 2, 7, 3, 4, 5][i]), i === 2 ? .6 : .4, {...HIGH, pan: -.3 + i * .12}, i === 2 ? .12 : .04));
  run(flow.countUp.at, 0, 8, 1, flow.countUp.duration / 8, .3, .022);
  // Surpassing, while analyzing 20x more: a riser into the graph spread, a run on the axis.
  riser(mix, flow.cameraToAnalysis.at, flow.cameraToAnalysis.at + flow.cameraToAnalysis.duration * .8, 50, 76, .25, {...BLOCK, pan: 0});
  run(flow.analysisCountUp.at, 3, 10, 1, flow.analysisCountUp.duration / 10, .32, .02);
  // Flow-1 powers Signals: the engine spins in 32nd blips; the door shuts on a cut and an 808.
  run(flow.engineSpinner.at, 0, Math.round(flow.engineSpinner.duration / .05), 1, .05, .26, .02);
  zap(mix, flow.cameraToEngine.at, 50, 74, flow.cameraToEngine.duration, .35, BLOCK);
  mix.tapeStop(shut - .18, .16, 2);
  sub808(mix, shut, 26, 1.6, 1, SUB, {drop: 30, drive: 3});
  click(mix, shut, .6, KIT);

  // ── Our agent, built to analyze traces at scale: back to blocks and blips over 8th hats, no kick.
  const native = issues.native, preludeEnd = native - .2;
  const preludeFrom = shut + 1.2;
  for (let t = preludeFrom, k = 0; t < p.zoomOut.at - .1; t += BAR, k++) {
    const stop = Math.min(p.zoomOut.at - .05, t + BAR - (k % 2 ? .3 : .12));
    chord(t, stop, LOOP[k % LOOP.length], {cutoff: [500, 900], level: .75, sub: .55});
  }
  for (let t = preludeFrom; t < p.zoomOut.at - .05; t += Q / 2) hat(mix, t, .26, {...KIT, pan: .15});
  sub808(mix, p.bashStop, 26, .9, .85, SUB, {drop: 28});
  run(p.descent.at, 11, 10, -1, p.descent.duration / 12, .3, .025);
  blip(mix, p.highlight, 80, .45, HIGH, .08);
  if (p.bubble !== undefined) blip(mix, p.bubble, 86, .45, HIGH, .06);
  // It finds deep issues and reports them: a blip per label row; the typed explanation is 16th data.
  if (p.labels) for (let i = 0; i < 4; i++) blip(mix, p.labels.at + i * p.labels.duration / 4, lydian(2 + i * 2), .42, {...HIGH, pan: -.2 + i * .13}, .04);
  if (p.explanation) for (let t = p.explanation.at, i = 0; t < p.explanation.at + p.explanation.duration; t += .1, i++) blip(mix, t, lydian([4, 6, 5, 8][i % 4]), .3, DATA, .025);
  // Across every trace: the zoom out rises; the collapse zaps; the circle grows on a swelling block and a snare-roll, cut before the grid.
  riser(mix, p.zoomOut.at, p.collapse, 45, 69, .3, {...BLOCK, pan: 0});
  sub808(mix, p.collapse, 30, .7, .85, SUB, {drop: 30});
  block(mix, p.circleGrow.at, preludeEnd, II.tones, BLOCK, {root: II.root, level: .85, cutoff: [300, 2200]});
  for (let t = p.circleGrow.at + .4, k = 0; t < preludeEnd - .02; t += t > preludeEnd - .8 ? .05 : .1, k++) clap(mix, t, .2 + .5 * (t - p.circleGrow.at) / (preludeEnd - p.circleGrow.at), {...KIT, pan: k % 2 ? .1 : -.1});

  // ── It clusters issues into high-level patterns: the groove again, anchored on the grid's appearance.
  const h = (beat: number) => native + beat * Q, homeTo = (end.start - native) / Q;
  const home = loopBars(0, homeTo, GROOVE, 0);
  sub808(mix, native, 26, 1.2, 1, SUB, {drop: 34, drive: 3.4});
  trap(home, 0, homeTo, {stabs: true, grid: h});
  if (issues.postludeActive) {
    // Every issue triangle is a blip, fanned out by height into a cascade over the D Lydian scale.
    cascade(issues.pops, SCALE, .025).forEach((note, i) => blip(mix, note.time, note.midi, .34 - Math.min(.2, i * .004), {...DATA, pan: note.pan * .5}, .025));
    // The clusters lock on a wide block stab over the 808.
    const lock = issues.clusters[0];
    block(mix, lock, lock + .5, I.tones.map(t => t + 12), HIGH, {level: .6, cutoff: [3200, 1200]});
    sub808(mix, lock, 26, .8, .9, SUB, {drop: 30});
  }

  // ── Unlock the insights hiding in millions of agent traces: the kit drops away, blocks switch on and off.
  const logo = end.logo;
  for (let t = end.start, k = 0; t < logo - .15; t += BAR, k++) chord(t, Math.min(logo - .15, t + BAR - (k % 2 ? .28 : .12)), LOOP[k % LOOP.length], {cutoff: [700, 1300], level: .8, sub: .6});
  for (let t = end.start; t < logo - .15; t += Q / 2) hat(mix, t, .24, {...KIT, pan: -.1});
  // ── With Laminar: one last Dmaj7♯11 over a long 808, the ♯11 on top; everything else is off.
  sub808(mix, logo, 26, end.end - logo - .4, 1, SUB, {drop: 34, drive: 3, decay: 2.2});
  block(mix, logo, end.end - .5, I.tones, BLOCK, {root: I.root, level: .9, cutoff: [1600, 500]});
  block(mix, logo, logo + 1.2, I.tones.map(t => t + 12), HIGH, {level: .45, cutoff: [3500, 900]});
  blip(mix, logo + .8, 92, .35, {...HIGH, delay: .5}, .08);
}
