import type {ScoreCues} from '../cues';
import {clamp} from '../dsp';
import type {Mix, Route} from '../voices';
import {VOICEOVER_PHRASES} from '../../voiceover-phrases';
import {chordAt, loopBars, progression, type Chord, type Progression} from '../writing';
import {blip, block, clap, click, droplet, hat, haze, meter, pure, riser, sub808, sweep, tick, warn, zap} from './instruments';

/*
 * "Digital, after the X reference" (LAM-2315) — D Lydian at 150 BPM, half-time, scored to the motion.
 *
 * The reference's language (a driven 808 carrying the energy, Dmaj7♯11 against E/D and F♯m, chord blocks
 * switched with no fades, square data blips, zaps, 16th hats) is played by the picture, not over it:
 * - every camera move is a sweep shaped to its speed and gated on its settle frame;
 * - each object has one sound (agent ball, span, warning, window, cloud, meter, the Flow-1 motif), and hits
 *   land on the frame a move settles, not the frame it starts;
 * - the groove is earned: Cost from the Bash window, Flow-1 from the drop, and the issue grid. Elsewhere blocks
 *   are gated by what appears, and the kit drops out for every big move;
 * - five tier-A hits (Bash, the drop, the door, the grid, the logo) each come out of dead air;
 * - the voice is kept on top by the mix (a static carve and a mid-band-only duck), not by the score thinning.
 * The arc is a withheld tonic. Until "Introducing Flow-1" there is no D in the bass, the motif never completes,
 * there is no clap, no 16th hats, nothing brighter than 2 kHz and nothing panned: curiosity (F♯m9, sparse) →
 * pressure (Cost: the minor side, thin). The drop gives all of it at once (D1, the whole motif, the first clap,
 * a wide octave block); Issues is order; the millions climb over a D pedal into the logo's Dmaj9♯11 over four octaves.
 */

const SUB: Route = {bus: 'music', gain: 1};
const BLOCK: Route = {bus: 'music', gain: 1, room: .05};
const HIGH: Route = {bus: 'music', gain: .9, room: .16, delay: .12};
const KIT: Route = {bus: 'music', gain: 1, room: .12};
const DATA: Route = {bus: 'music', gain: .8, room: .1, delay: .1};
/** Motion and object sounds sit on the foley bus, so the score's stutters and tape stops never bend them. */
const MOVE: Route = {bus: 'sfx', gain: 1.3, room: .08};
/** Object sounds sit in a small, bright room; echo is kept for a few hand-picked hits in the gaps (ECHO). */
const OBJ: Route = {bus: 'sfx', gain: 1.7, room: .14};
const ECHO: Route = {...OBJ, delay: .12};
const TEXTURE: Route = {bus: 'sfx', gain: 1.1, room: .14};

type Voiced = Chord & {root: number};
/** Tones are the gated block's voicing; `root` is the buzzing saw an octave under the 808's note, as in the reference. */
const I: Voiced = {bass: 26, root: 26, tones: [50, 54, 57, 61, 68]};
/** The first half's tonic stand-in: F♯m9 over F♯, the D withheld until the drop. */
const Iwant: Voiced = {bass: 30, root: 30, tones: [54, 57, 61, 64, 68]};
const II: Voiced = {bass: 28, root: 28, tones: [52, 56, 59, 62, 66]};
const iii: Voiced = {bass: 30, root: 30, tones: [49, 54, 57, 61, 64]};
const V: Voiced = {bass: 33, root: 33, tones: [52, 57, 61, 64, 66]};
/** The minor side of the Lydian collection, for the problems: Bm and G♯ø. */
const vi: Voiced = {bass: 23, root: 35, tones: [47, 50, 54, 57, 61]};
const iv0: Voiced = {bass: 32, root: 32, tones: [50, 54, 56, 59, 62]};
/** The ♯11 exposed on top and driven harder: the pink/salmon "Thinking…" spans. */
const Isharp: Voiced = {...Iwant, tones: [...Iwant.tones, 80]};
/** The last climb over a D pedal: E/D, F♯m/D, A/D. */
const onD = (voiced: Voiced): Voiced => ({...voiced, bass: 26, root: 26});
const GROOVE = [I, II, iii, V], PRESSURE = [iii, II, vi, II];
/** D Lydian, high: the data never leaves it except for the one wrong note on each failure. */
const SCALE = [74, 76, 78, 80, 81, 83, 85, 86, 88, 90, 92, 93];
/** Flow-1's motif: 9, ♯11, 5 (E6–G♯6–A6); on the logo it finally resolves to D7. */
const MOTIF = [88, 92, 93];
/** The stream, as the picture lays it out: each span snaps in at a fraction of the run (H = tool hexagon, B = chat bubble, S = settle). */
const STREAM: [number, 'H' | 'B' | 'S' | Voiced][] = [
  [.006, 'H'], [.102, II], [.199, 'B'], [.238, Isharp], [.270, 'S'], [.458, iii], [.508, 'H'],
  [.593, Iwant], [.643, 'S'], [.798, 'H'], [.914, II], [.960, 'B'], [.998, Isharp],
];
/** The blue agent's hops down the report's Bash log, as fractions of the descent. */
const HOPS = [.052, .206, .483, .637, .768];
/** Narration windows; phrases closer than 0.4 s are one window, so the kit doesn't flicker between modes in a breath. */
const VOICE = VOICEOVER_PHRASES.map(phrase => ({from: phrase.placed.at - .05, to: phrase.placed.at + phrase.placed.duration + .05}))
  .reduce<{from: number; to: number}[]>((merged, phrase) => {
    const last = merged[merged.length - 1];
    if (last && phrase.from - last.to < .3) last.to = Math.max(last.to, phrase.to); else merged.push({...phrase});
    return merged;
  }, []);
const speaking = (time: number) => VOICE.some(phrase => time >= phrase.from && time < phrase.to);
const within = (time: number, ranges: readonly [number, number][]) => ranges.some(([from, to]) => time >= from && time < to);

export function composeDigital(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion, p = issues.prelude;
  const drop = flow.reveal, Q = .4, BAR = 4 * Q;
  const lydian = (step: number) => SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
  const settle = (span: {at: number; duration: number}) => span.at + span.duration;
  /** Ease-out moves read as landed at 70 % of their span; the rest is the easing tail. */
  const lands = (span: {at: number; duration: number}) => span.at + .7 * span.duration;
  const FRAME = 1 / 30;
  /** Everything is centred until the drop; width is one of the things the first half withholds. */
  const wide = (time: number, pan: number) => time < drop ? 0 : pan;
  const obj = (time: number, pan = 0, route: Route = OBJ): Route => ({...route, pan: wide(time, pan)});
  const nearest = (midi: number) => SCALE.reduce((best, note) => Math.abs(note - midi) < Math.abs(best - midi) ? note : best);

  /**
   * A block chord from `start` to `end`, 808 underneath, switched hard at both ends. Nothing opens past 2 kHz
   * before the drop or past 2.4 kHz under the voice, and only chords after the drop are wide; `pulse` gates it in
   * 16ths so a long chord moves.
   */
  const chord = (start: number, end: number, voiced: Voiced, options: {level?: number; cutoff?: [number, number]; drive?: number; sub?: number; swell?: boolean; pulse?: boolean} = {}) => {
    if (end - start < .03) return;
    const ceiling = start < drop ? 2000 : speaking(start) || speaking(end) ? 2400 : Infinity, [from, to] = options.cutoff ?? [700, 1100];
    // The first half also sits a few dB under the drop.
    const held = start < drop ? .65 : 1;
    block(mix, start, end, voiced.tones, BLOCK, {root: voiced.root, level: (options.level ?? 1) * held, cutoff: [Math.min(from, ceiling), Math.min(to, ceiling)], drive: options.drive, swell: options.swell, pulse: options.pulse ? Q / 4 : undefined, width: start < drop ? 0 : .35});
    if (options.sub) sub808(mix, start, voiced.bass + 12, end - start, options.sub * held, SUB, {drop: 12, decay: 4, drive: 1.4});
  };
  /** A run of blips `every` seconds apart walking the scale, panned from `panFrom` to `panTo`. */
  const run = (time: number, from: number, steps: number, direction: 1 | -1, every: number, velocity: number, options: {length?: number; panFrom?: number; panTo?: number; route?: Route} = {}) => {
    for (let i = 0; i < steps; i++) {
      const pan = (options.panFrom ?? 0) + ((options.panTo ?? 0) - (options.panFrom ?? 0)) * i / Math.max(1, steps - 1);
      blip(mix, time + i * every, lydian(from + i * direction), velocity * (1 - i * .03), {...(options.route ?? DATA), pan: wide(time, pan)}, options.length ?? .025);
    }
  };
  /** The motif, never doubled under E6: E5–A5 is the voice's formant range. */
  const motif = (time: number, velocity: number, notes = MOTIF, every = Q / 4) => notes.forEach((midi, i) => {
    blip(mix, time + i * every, midi, velocity, {...HIGH, delay: .22}, .06, {exact: true, body: .7});
  });
  /** A window opening (up-zap and a click) or shutting (down-zap and a low sine latch). */
  const window = (time: number, open: boolean, velocity = .5) => {
    zap(mix, time, open ? 62 : 74, open ? 74 : 62, .06, velocity, obj(time));
    if (open) click(mix, time + .06, velocity * .7, obj(time + .06)); else latch(time + .06, velocity * 1.4);
  };
  /** A latch is a low zap for the body plus a click and a C♯7 tick (not the D7 the logo saves), so it still reads on laptop speakers. */
  const latch = (time: number, velocity = .5) => {
    zap(mix, time, 54, 42, .015, velocity, obj(time));
    click(mix, time, .25, obj(time));
    pure(mix, time, 97, velocity * .5, obj(time), .008);
  };
  /** A highlight scanning a line: 32nd taps around 2 kHz under a 3 kHz low-pass; `detuned` rocks ♯11–5 (G♯6–A6) for a problem. */
  const scan = (time: number, duration: number, velocity: number, detuned: boolean, until = Infinity) => {
    for (let t = time, k = 0; t < Math.min(time + duration, until); t += Q / 8, k++) {
      blip(mix, t, detuned && k % 2 ? 92 : 93, velocity * (k % 2 ? .7 : 1), obj(t, -.25 + .5 * (t - time) / duration), .015, {bright: 3000, body: .2});
    }
  };

  /**
   * The half-time trap bar (16 sixteenths) from an anchor hit: 808 on 1, the "a" of 2 and the "and" of 3; clap on
   * 3; 16th hats with a 32nd roll into every second bar. `mute` removes the whole kit (the picture moves), `bare`
   * leaves only the 808, and `still` (the picture holds) drops the clap and the stabs to quarter hats at 0.8.
   * By default the anchor is a tier-A hit with its own 808, so the groove's first downbeat is left to it instead of
   * stacking a second, differently bent D1 on top; `unanchored` grooves play their own.
   */
  type TrapOptions = {
    level?: number; clap?: boolean; stabs?: boolean; hats?: 8 | 16; q?: number; cutoff?: [number, number];
    mute?: [number, number][]; bare?: [number, number][]; still?: [number, number][]; hits?: number[]; unanchored?: boolean;
  };
  const trap = (progression: Progression, anchor: number, beats: number, options: TrapOptions = {}) => {
    const level = options.level ?? 1, q = options.q ?? Q, grid = (beat: number) => anchor + beat * q;
    for (let step = 0; step < beats * 4 - 1e-9; step++) {
      const t = grid(step / 4), s = step % 16, bar = Math.floor(step / 16), voiced = chordAt(progression, step / 4)[1] as Voiced;
      if (within(t, options.mute ?? [])) continue;
      const bare = within(t, options.bare ?? []), still = within(t, options.still ?? []);
      const lift = still ? .8 : 1, onHit = (step === 0 && !options.unanchored) || (options.hits ?? []).some(hit => Math.abs(t - hit) < .03);
      if ((s === 0 && !onHit) || s === 7 || s === 10) sub808(mix, t, voiced.bass + (s === 10 ? 12 : 0), s === 0 ? q * 1.7 : q * .8, (s === 0 ? .95 : .75) * level * lift, SUB, {drop: s === 0 ? 26 : 19, decay: 2.5});
      if (bare) continue;
      if (options.clap !== false && !still && s === 8) clap(mix, t, .8 * level, {...KIT, pan: wide(t, .1)});
      const eighths = options.hats === 8;
      if (still) { if (s % 4 === 0) hat(mix, t, .4 * level, {...KIT, pan: wide(t, -.15)}); }
      else if ((bar & 1) === 1 && s >= 12 && !eighths) [0, .05].forEach(offset => hat(mix, t + offset, (.38 + .1 * (s - 12)) * level, {...KIT, pan: wide(t, .4)}));
      else if (s % 2 === 0 || !eighths) hat(mix, t, (s % 2 ? .28 : .46) * level, {...KIT, pan: wide(t, s % 4 === 2 ? .4 : -.3)}, .018 * (s % 2 ? .6 : 1.2));
      const stab = s === 0 || s === 3 || s === 6 || s === 11 || s === 14;
      if (options.stabs && stab && !still && !onHit) block(mix, t, Math.min(grid(beats), t + .085), voiced.tones, BLOCK, {level: .95 * level * lift, cutoff: options.cutoff ?? [1600, 900]});
    }
  };

  // ════ Chapter 1 — curiosity. Out of silence, the pill grows the first chord; the stream plays itself.
  droplet(mix, u2.agentEnter + .01, 86, .55, obj(u2.agentEnter + .01), {thump: .35});
  const pillSettle = lands(u2.firstThinking), stream = u2.stream.at;
  block(mix, u2.firstThinking.at, pillSettle, Iwant.tones, BLOCK, {root: Iwant.root, level: .7, cutoff: [250, 1200]});
  sweep(mix, u2.firstThinking.at, u2.firstThinking.duration, .25, MOVE, {from: 600, to: 2000, peak: .3});
  chord(pillSettle, stream - .04, Iwant, {level: .6, cutoff: [1200, 900], sub: .4});
  blip(mix, pillSettle, 85, .45, HIGH, .04);
  haze(mix, u2.firstThinking.at + .07, stream + 1.6, MOVE, progress => [350, .12 * Math.min(1, progress * 6, (1 - progress) * 3)]);

  // ── Every time it runs, it leaves a trace: each span that snaps in switches the chord; tools tick, bubbles chirp.
  const at = (fraction: number) => stream + fraction * u2.stream.duration, streamEnd = u2.failure - .02;
  const spans = STREAM.filter(([, kind]) => typeof kind !== 'string') as [number, Voiced][];
  // Only the first span gets an 808: ten in five seconds would spend the hits the film needs later.
  spans.forEach(([fraction, voiced], i) => {
    const from = at(fraction), to = i + 1 < spans.length ? at(spans[i + 1][0]) - .035 : streamEnd;
    chord(from, Math.min(to, streamEnd), voiced, {level: .5, cutoff: [700, 1150], sub: i === 0 ? .25 : 0, drive: voiced === Isharp ? 2.5 : undefined});
  });
  /** One pitch per span type: Thinking (the ♯11 spans), Read, Write. */
  const spanPitch = (voiced: Voiced) => voiced === Isharp ? 85 : voiced === II ? 88 : voiced === iii ? 81 : 86;
  // Before the first span, the stream opens on I behind the tool hexagon.
  chord(at(STREAM[0][0]), at(spans[0][0]) - .035, Iwant, {level: .55, cutoff: [700, 1000], sub: .3});
  STREAM.forEach(([fraction, kind], i) => {
    const time = at(fraction), pan = .1 * Math.sin(i * 1.3);
    click(mix, time, .15, obj(time, pan));
    if (kind === 'H') { sub808(mix, time, 40, .06, .3, SUB, {drop: 12, drive: 1}); blip(mix, time, 81, .4, obj(time, pan), .03); }
    else if (kind === 'B') { blip(mix, time, 85, .35, obj(time, .15), .03); blip(mix, time + .04, 88, .35, obj(time + .04, .15), .03); }
    else if (kind === 'S') blip(mix, time, lydian(i), .28, obj(time, pan), .025);
    else blip(mix, time, spanPitch(kind), .3, obj(time, pan), .025);
  });

  // ── When your agent fails: the chain glitches into dead air, a falling sub zap and one off-key G♮.
  zap(mix, u2.failure, 52, 28, .32, .9, BLOCK);
  blip(mix, u2.failure + .37, 79, .42, ECHO, .06, {exact: true});
  // The Bash span turns upward; F♯m enters on the frame it settles.
  const turned = settle(u2.upwardTurn);
  // The turn: a flick on its first frame, E/D breathing in over its last 200 ms, and the click on the settle.
  zap(mix, u2.upwardTurn.at, 67, 79, .09, .35, obj(u2.upwardTurn.at));
  block(mix, turned - .2, turned - .01, II.tones, BLOCK, {root: II.root, level: .5, cutoff: [500, 1100], swell: true});
  click(mix, turned, .45, obj(turned));
  chord(turned, u2.highlight.at + .1, iii, {level: .6, cutoff: [500, 1100], sub: .45});
  // The trace can tell you why: the camera backs up; the drawers glide down into their notes and latch.
  sweep(mix, u2.backtrack.at, u2.backtrack.duration, .5, MOVE, {from: 300, to: 2400, peak: .45, split: speaking(u2.backtrack.at + .5)});
  u2.drawers.forEach((time, i) => {
    // C♯6, then the motif's first two notes; the A6 that would complete it is withheld until the drop.
    const note = [85, 88, 92][i];
    zap(mix, time, note + 5, note, .025, .25, obj(time, -.2 + i * .2));
    blip(mix, time + .025, note, .35, obj(time + .025, -.2 + i * .2), .05);
    latch(time + .25 - (i === 2 ? .13 : 0), .35);
  });
  // The red highlight scans, then 60 ms of nothing, then the warning over an 808 and the minor side (G♯ø).
  scan(u2.highlight.at, u2.highlight.duration, .4, true, u2.warning - .07);
  warn(mix, u2.warning, .6, obj(u2.warning));
  sub808(mix, u2.warning, 28, .9, .8, SUB, {drop: 30});
  // ── The insights are hidden: the G♯ø opens with the camera's drop (a split sweep under the voice); F♯m lands on the settle.
  const insightsSettle = u2.insights + .62, zoom = u2.zoom.at, collapse = u2.collapse.at;
  chord(u2.warning + .05, u2.insights, iv0, {level: .5, cutoff: [500, 700], sub: 0});
  chord(u2.insights, insightsSettle - .03, iv0, {level: .6, cutoff: [700, 1500], sub: 0});
  sweep(mix, u2.insights, insightsSettle - u2.insights, .45, MOVE, {peak: .35, split: true, sub: [40, 30]});
  chord(insightsSettle, zoom, iii, {level: .55, cutoff: [600, 800], sub: .45});
  for (let t = insightsSettle; t < zoom - .05; t += Q / 2) hat(mix, t, .26, KIT);
  // The zoom out pulses the chords open as far as the first half allows; a riser is cut dead before the collapse.
  const zoomHalf = zoom + (collapse - zoom) / 2;
  chord(zoom, zoomHalf, Iwant, {level: .6, cutoff: [700, 1000], sub: .5, pulse: true});
  chord(zoomHalf, collapse - .09, II, {level: .7, cutoff: [1000, 1200], sub: .55, pulse: true});
  for (let t = zoom; t < collapse - .09; t += Q / 2) hat(mix, t, .3, KIT);
  riser(mix, zoom + .6, collapse - .08, 52, 76, .35, BLOCK);
  sweep(mix, zoom, collapse - zoom - .08, .3, MOVE, {from: 400, to: 5000, peak: .9, split: true});
  // The collapse into the grid: an 808 and a shatter of tiny warnings across the field.
  sub808(mix, collapse, 30, .8, .9, SUB, {drop: 30, drive: 2});
  for (let i = 0; i < 12; i++) warn(mix, collapse + .02 + mix.random() * .25, .2, OBJ, {soft: true, midi: [68, 73, 76, 80][Math.floor(mix.random() * 4)]});
  // The cloud rises over the warnings and sinks everything into a low Bm.
  const cloudTop = settle(u2.cloudIn);
  haze(mix, collapse + .25, cloudTop + .6, MOVE, progress => [150 + 750 * progress ** 1.5, .2 * Math.min(1, progress * 1.4) * (progress > .88 ? (1 - progress) / .12 : 1)], 5000);
  chord(collapse + .3, u2.ifOnly - .14, vi, {level: .5, cutoff: [300, 600], sub: .5});
  // If only someone could read them all: the motif's first two notes in the echo, the third withheld, then E/D left hanging.
  motif(u2.ifOnly - .22, .42, [88, 92], .1);
  chord(u2.ifOnly + .75, cost.cloudOut.at, II, {level: .42, cutoff: [350, 520], sub: .3});

  // ════ Chapter 2 — pressure. The cloud parts, then a thin, dark trap; the purple ball zips across.
  const legsFrom = cost.cheapLegs[0]?.at ?? cost.cloudOut.at + .64;
  haze(mix, cost.cloudOut.at, legsFrom, MOVE, progress => [400 + 2600 * progress ** 2, .28 * progress ** 1.5], 7000);
  const cheapBeats = Math.floor((cost.cameraToBash.at - legsFrom) / Q * 4) / 4;
  trap(loopBars(0, cheapBeats, [iii, II], 0), legsFrom, cheapBeats, {level: .72, clap: false, hats: 8, unanchored: true});
  cost.cheapLegs.forEach(leg => {
    const right = leg.direction === 'leftToRight';
    // Short moves: the sweep starts a frame early and peaks early, with a click on the first frame.
    sweep(mix, leg.at - FRAME, leg.duration, .3, MOVE, {from: 500, to: 2600, peak: .25, split: true});
    click(mix, leg.at, .3, obj(leg.at, right ? -.3 : .3));
    run(leg.at, right ? 0 : 9, 8, right ? 1 : -1, leg.duration / 8, .38, {length: .02, panFrom: right ? -.3 : .3, panTo: right ? .3 : -.3});
  });
  // …but fail to find crucial issues: three warnings fall off the trace, the buffer stutters.
  [-.25, 0, .25].forEach((pan, i) => {
    const time = cost.thinkingDrop.at + i * .06;
    warn(mix, time, .35, obj(time, pan), {soft: true, midi: 80 - i * 4});
    zap(mix, time + .05, 80 - i * 4, 68 - i * 4, .09, .22, obj(time + .05, pan));
  });
  mix.stutter(cost.missIssues + .15, .05, 6);

  // Powerful LLMs: the film's biggest camera move empties the room, then Bash lands out of dead air.
  const bash = cost.bashStop;
  sweep(mix, cost.cameraToBash.at, bash - .1 - cost.cameraToBash.at, .75, MOVE, {from: 250, to: 3200, peak: .45, sub: [52, 28], split: speaking(cost.cameraToBash.at + .1)});
  window(cost.bashEntry.at, true, .45);
  sub808(mix, bash, 28, 1.4, .8, SUB, {drop: 31, drive: 2.6});
  block(mix, cost.bashExpand, cost.bashExpand + .15, iii.tones, BLOCK, {level: .6, cutoff: [800, 1200]});
  const depletion = cost.depletion.at, costBeats = (depletion - bash) / Q;
  trap(loopBars(0, costBeats, PRESSURE, 0), bash, costBeats, {
    level: .55, stabs: true, clap: false, hats: 8, cutoff: [1000, 700],
    mute: [[cost.bashWarning, cost.bashWarning + Q]],
    bare: [[cost.cameraToBudget.at, settle(cost.cameraToBudget)]],
  });
  // The log scrolls in ticks; the three lines are scanned; the warning stops the kit for a beat.
  for (let t = cost.bashDescent.at, i = 0; t < settle(cost.bashDescent); t += 1 / 12, i++) tick(mix, t, (i % 2 ? .18 : .3) - i * .005, OBJ, -i * .3);
  [0, .12, .24].forEach(offset => scan(cost.bashHighlight.at + offset, .2, .25, true));
  warn(mix, cost.bashWarning, .6, obj(cost.bashWarning));
  // The purple agent is one detuned droplet: it appears, drops down the log, moves onto the highlight, leaves.
  [cost.bashEntry.at + .31, cost.bashDescent.at + .34, cost.bashHighlight.at - .11, cost.cameraToBudget.at + .62]
    .forEach((time, i) => droplet(mix, time, [85, 83, 81, 78][i], .38, obj(time, -.1 + i * .08), {detune: true}));
  // The camera drops to the budget; smoke; the $ is a coin, and the meter's pitch is its fill.
  sweep(mix, cost.cameraToBudget.at, cost.cameraToBudget.duration, .45, MOVE, {peak: .45, split: true, sub: [40, 30]});
  haze(mix, cost.smokeEnter, settle(cost.depletion), MOVE, progress => [200 + 300 * progress, .16 * Math.min(1, progress * 4)], 4000);
  blip(mix, cost.budgetAppear, 93, .45, OBJ, .05, {exact: true, body: .8});
  const full = settle(cost.budgetRun), drained = settle(cost.depletion);
  const filled = (progress: number) => clamp((cost.budgetAppear + progress * (full - cost.budgetAppear) - cost.budgetRun.at) / cost.budgetRun.duration);
  meter(mix, cost.budgetAppear + .12, full, .22, TEXTURE, progress => nearest(74 + 7 * filled(progress)), progress => 8 + 16 * filled(progress));
  meter(mix, full, depletion, .16, TEXTURE, () => 81, () => 6, () => 3000);
  // …but the costs are unsustainable: the meter drains, slowing, falling and darkening, while the whole score tape-stops.
  meter(mix, depletion, drained, .3, TEXTURE, progress => 81 - 19 * progress ** 1.3, progress => 24 * (4 / 24) ** progress, progress => 3000 * (400 / 3000) ** progress);
  mix.tapeStop(depletion, Math.min(cost.depletion.duration, drop - depletion - .9), 1.2);

  // ════ Chapter 3 — release. "Until now": a held breath; the camera rises into 310 ms of dead air, then the drop.
  const breath = depletion + Math.min(cost.depletion.duration, drop - depletion - .9) + .05, gap = drop - .31;
  sub808(mix, breath, 33, gap - breath, .42, SUB, {drop: 0, drive: 1.6});
  blip(mix, breath + .05, 81, .22, {...HIGH, delay: .4}, .12, {exact: true});
  riser(mix, flow.entry.at, gap, 45, 69, .4, BLOCK);
  sweep(mix, flow.entry.at, gap - flow.entry.at, .35, MOVE, {from: 300, to: 4500, peak: .85, grab: 1.5});
  droplet(mix, flow.entry.at, 81, .4, obj(flow.entry.at), {thump: .3});

  // Introducing Flow-1: the brightest hit in the film, the motif on top, then the groove (I – II – iii – V).
  const shut = flow.coverShut, flowBeats = Math.round((shut - drop) / Q);
  // The first D in the bass, the first clap, the first width: an octave block with ±12-cent copies at ±0.6.
  sub808(mix, drop, 26, 1.6, 1, SUB, {drop: 34, drive: 3.4});
  // Bright until "Introducing" starts (260 ms in), then held darker under the voice.
  const introduced = drop + .25;
  [0, -.8, .8].forEach(pan => {
    const tones = I.tones.map(t => t + 12 + pan * .15), route = {...HIGH, pan};
    block(mix, drop, introduced, tones, route, {level: pan ? .4 : .55, cutoff: [6000, 4800]});
    block(mix, introduced, drop + .9, tones, route, {level: pan ? .2 : .25, cutoff: [1400, 900]});
  });
  clap(mix, drop, .9, KIT);
  motif(drop, .55);
  haze(mix, drop, drop + 1.5, MOVE, progress => [6000 - 4000 * progress, .22 * (1 - progress) ** 2], 12_000);
  const cameraHole: [number, number] = [flow.cameraZoom.at + .4, settle(flow.cameraZoom) - .34];
  const engineFrom = flow.cameraToEngine.at;
  // The harmony changes with the picture: V on the analysis move, I on the frame the "20×" lands.
  const spread = flow.cameraToAnalysis, spreadEnd = settle(spread), beatOf = (time: number) => (time - drop) / Q;
  const flowChords = progression([0, I], [4, II], [8, iii], [12, V], [16, I], [beatOf(spread.at), V], [beatOf(spreadEnd), I], [beatOf(spreadEnd) + 4, II], [beatOf(spreadEnd) + 8, iii]);
  const beadLanded = flow.numberDrops[2];
  trap(flowChords, drop, flowBeats, {
    level: 1, stabs: true, cutoff: [1800, 1000],
    mute: [cameraHole, [engineFrom, shut + 1]],
    bare: [[spread.at, spreadEnd]],
    still: [[beadLanded + .1, spread.at], [spreadEnd + .05, spreadEnd + 1.25]],
  });
  // The fly-through: a big sweep through the cloud exit; the percentage counts up in ticks.
  sweep(mix, flow.cameraZoom.at, flow.cameraZoom.duration, .6, MOVE, {from: 300, to: 4200, peak: .5, split: true});
  haze(mix, flow.cloudExit.at, settle(flow.cloudExit), MOVE, progress => [2500 * (1 - progress) + 300, .14 * (1 - progress)], 8000);
  for (let i = 0; i < 8; i++) tick(mix, flow.countUp.at + i * flow.countUp.duration / 8, (i % 2 ? .16 : .26) + i * .02, OBJ, i);
  block(mix, flow.benchmark, flow.benchmark + .12, II.tones.map(t => t + 12), HIGH, {level: .35, cutoff: [1600, 1000]});
  // The beads drop onto the chart, pitched by score (flow-1's is the motif, above everyone else).
  const beadPitch = [93, 90, 0, 86, 81, 80];
  flow.numberDrops.forEach((time, i) => {
    if (i === 2) { motif(time, .45); sub808(mix, time, 38, .3, .45, SUB, {drop: 18, drive: 1}); return; }
    droplet(mix, time, beadPitch[i], .22, obj(time, -.3 + i * .12));
  });
  // Flow-1's bead drops in last while the chart re-spaces: it falls on a rising zap straight into the motif.
  const beadFall = Math.max(...flow.numberDrops.filter((_, i) => i !== 2)) + .29;
  if (beadLanded - beadFall > .2) {
    sweep(mix, beadFall, beadLanded - beadFall, .3, MOVE, {peak: .6, split: true, panFrom: -.1, panTo: .1});
    zap(mix, beadFall, 80, 88, .09, .2, obj(beadFall, .05));
  }
  // 20x more traces per dollar: flow-1's bead glides right on its motif; the kit drops to the 808 until it settles.
  zap(mix, spread.at, 88, 93, .09, .25, obj(spread.at, .15));
  riser(mix, spread.at, spreadEnd - .02, 50, 76, .25, BLOCK);
  sweep(mix, spread.at, spread.duration, .35, MOVE, {peak: .4, split: true, panFrom: -.1, panTo: .3});
  for (let i = 0; i < 10; i++) tick(mix, flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 10, i % 2 ? .14 : .22, OBJ, i);
  sub808(mix, spreadEnd, 26, .6, .75, SUB, {drop: 20, drive: 1.2});
  block(mix, spreadEnd, spreadEnd + .25, I.tones.map(t => t + 12), HIGH, {level: .35, cutoff: [1600, 900]});
  blip(mix, spreadEnd, 93, .4, {...HIGH, delay: .3}, .08, {exact: true});
  // Flow-1 powers Signals: the camera flies to the engine (kit out), the module lights on the motif, the spinner
  // accelerates, the two halves of the door converge, and it shuts on a tape stop and an 808.
  sweep(mix, engineFrom, flow.cameraToEngine.duration, .5, MOVE, {peak: .45, split: true});
  riser(mix, engineFrom, settle(flow.cameraToEngine), 50, 62, .25, BLOCK);
  motif(flow.moduleActivation, .4, [92, 93]);
  block(mix, flow.moduleActivation, flow.moduleActivation + .3, I.tones.map(t => t + 12), HIGH, {level: .4, cutoff: [4800, 1900]});
  for (let t = flow.engineSpinner.at, k = 0; t < settle(flow.engineSpinner); k++) {
    const progress = (t - flow.engineSpinner.at) / flow.engineSpinner.duration;
    blip(mix, t, lydian(k), .22 + .12 * progress, DATA, .018);
    t += 1 / (8 + 16 * progress);
  }
  [-.3, .3].forEach(pan => zap(mix, flow.cover.at, pan < 0 ? 74 : 98, 86, .09, .25, obj(flow.cover.at, pan)));
  block(mix, flow.coverTint.at, shut - .02, I.tones, BLOCK, {level: .45, cutoff: [600, 2400], swell: true});
  mix.tapeStop(shut - .18, .16, 2);
  sub808(mix, shut, 26, 1.6, 1, SUB, {drop: 30, drive: 3});
  click(mix, shut, .6, KIT);
  block(mix, shut, shut + .3, I.tones.map(t => t + 12), HIGH, {level: .4, cutoff: [2600, 900]});
  // The Signals circle turns: a heartbeat on A.
  for (let t = shut + Q * 2; t < issues.leadIn.at - .1; t += Q) pure(mix, t, 81, .3, {...HIGH, delay: .15}, .05);

  // ════ Chapter 4 — competence, then order. The circle dives into the rows; the report is precise UI sound.
  const rows = issues.leadIn.at + .57, native = issues.native;
  sweep(mix, issues.leadIn.at, rows - issues.leadIn.at, .45, MOVE, {peak: .3, split: true, sub: [45, 33]});
  droplet(mix, rows, 86, .5, obj(rows), {fifth: true, thump: .25});
  const reportFrom = p.labels?.at ?? p.descent.at + p.descent.duration + 1;
  for (let t = rows, k = 0; t < reportFrom - .1; t += BAR, k++) chord(t, Math.min(reportFrom - .06, t + BAR - (k % 2 ? .3 : .12)), [I, II][k % 2], {level: .5, cutoff: [800, 1150], sub: .35, pulse: true});
  window(p.bashEntry.at, true, .4);
  sub808(mix, p.bashStop, 26, .9, .7, SUB, {drop: 20, drive: 1});
  const descentEnd = settle(p.descent);
  for (let t = p.descent.at; t < descentEnd; t += Q / 2) hat(mix, t, .22, {...KIT, pan: .15});
  for (let t = p.descent.at, i = 0; t < descentEnd; t += 1 / 12, i++) tick(mix, t, i % 2 ? .14 : .22, obj(t, -.1), i % 4);
  HOPS.forEach((fraction, i) => droplet(mix, p.descent.at + fraction * p.descent.duration, [90, 88, 86, 85, 83][i], .4, obj(p.descent.at + fraction * p.descent.duration, .1), {fifth: true}));
  droplet(mix, p.highlight - .03, 86, .32, obj(p.highlight, .1), {fifth: true});
  scan(p.highlight, .5, .2, false);
  if (p.bubble !== undefined) { warn(mix, p.bubble, .55, obj(p.bubble), {resolve: true}); droplet(mix, p.bubble - .03, 93, .3, obj(p.bubble - .03)); }
  // Not just with labels: the card opens and each row reads true / false / critical.
  if (p.labels) {
    zap(mix, p.labels.at, 69, 81, .09, .3, obj(p.labels.at));
    chord(p.labels.at, (p.explanation?.at ?? p.labels.at + 2) - .05, I, {level: .38, cutoff: [600, 800], sub: .25});
    [93, 74, 93].forEach((midi, i) => blip(mix, p.labels!.at + (i + 1) * p.labels!.duration / 4, midi, midi === 74 ? .3 : .42, obj(p.labels!.at + (i + 1) * p.labels!.duration / 4, -.15 + i * .1), .05));
    warn(mix, p.labels.at + p.labels.duration, .3, obj(p.labels.at + p.labels.duration), {soft: true});
  }
  const exit = p.bubbleExit ?? p.zoomOut.at;
  // …but with any structure you define: the explanation types in quiet high ticks over a held E/D.
  if (p.explanation) {
    latch(p.explanation.at - .6, .3);
    chord(p.explanation.at, exit - .02, II, {level: .38, cutoff: [600, 850], sub: .3});
    for (let t = p.explanation.at, i = 0; t < settle(p.explanation); t += 1 / 12, i++) tick(mix, t, i % 2 ? .11 : .18, obj(t, .1));
  }
  // Across every trace: the bubble exits, the camera pulls back on a riser cut at the collapse, which sucks in.
  sweep(mix, exit, .5, .35, MOVE, {peak: .35, panFrom: 0, panTo: -.3, split: true});
  riser(mix, p.zoomOut.at + .3, p.collapse - .06, 45, 69, .3, BLOCK);
  sweep(mix, p.zoomOut.at, p.collapse - p.zoomOut.at - .06, .3, MOVE, {from: 400, to: 5000, peak: .8, split: true});
  zap(mix, p.collapse - .3, 26, 50, .3, .5, SUB);
  click(mix, p.collapse, .5, obj(p.collapse));
  // The circle grows over the grid and reveals each triangle as it passes it, on a pulsing E/D and a clap roll.
  const swarmEnd = native - .2;
  chord(p.circleGrow.at, swarmEnd, II, {level: .85, cutoff: [300, 2200], pulse: true});
  for (let t = p.circleGrow.at + .4, k = 0; t < swarmEnd - .02; t += t > swarmEnd - .8 ? .05 : .1, k++) clap(mix, t, .2 + .5 * (t - p.circleGrow.at) / (swarmEnd - p.circleGrow.at), {...KIT, pan: k % 2 ? .1 : -.1});
  const grown = settle(p.circleGrow);
  issues.pops.forEach(pop => {
    const radius = Math.min(1, Math.hypot(pop.pan, (pop.height - .5) * 1.2) / .75);
    const time = p.circleGrow.at + radius * (grown - p.circleGrow.at) * .95;
    if (time < swarmEnd - .01) pure(mix, time, lydian(Math.round(pop.height * 11)), .22, obj(time, pop.pan * .5), .02);
  });

  // ── The issue grid: out of 200 ms of silence, the third big hit, and the groove anchored on it.
  // The grid's tempo is stretched a few percent so its third bar line lands on the clusters' lock, on I.
  const lock = issues.clusters[0], typingFrom = issues.windowDown.at;
  const gridQ = lock !== undefined && lock > native + 2 ? (lock - native) / 8 : Q;
  const grooveBeats = Math.round((end.start - native) / gridQ);
  const gridChords = progression([0, I], [4, II], [8, I], [12, iii], [16, V], [20, II], [24, I], [28, II]);
  sub808(mix, native, 26, 1.2, 1, SUB, {drop: 34, drive: 3.4});
  block(mix, native, native + .6, I.tones.map(t => t + 12), HIGH, {level: .55, cutoff: [5600, 1900]});
  trap(gridChords, native, grooveBeats, {
    level: .95, stabs: true, q: gridQ,
    bare: [[typingFrom, end.start]],
    still: lock !== undefined ? [[native + gridQ * 2, lock - .02]] : [], hits: lock !== undefined ? [lock] : [],
  });
  if (issues.postludeActive) {
    // The triangles migrate: six cluster voices take turns in a 16th arpeggio, each walking through D Lydian from a
    // scattered pitch onto its note of Dmaj7♯11 and dropping out on its own cluster's lock.
    const CLUSTERS = [74, 78, 81, 85, 88, 92], travel = issues.travel, SCATTER = [83, 90, 76, 93, 80, 86];
    // The locks are sorted, so the walk runs until the last voice has arrived, not just the first.
    const lastLock = Math.max(lock, ...issues.clusters);
    for (let t = travel.at, k = 0; t < lastLock - .02; t += gridQ / 4, k++) {
      const i = k % 6, arrive = issues.clusters[i] ?? lock, progress = clamp((t - travel.at) / (arrive - travel.at));
      if (t >= arrive - .02) continue;
      blip(mix, t, nearest(SCATTER[i] + (CLUSTERS[i] - SCATTER[i]) * (1 - (1 - progress) ** 2)), .14 + .14 * progress, {...TEXTURE, pan: -.3 + i * .12}, .025, {body: .3});
    }
    // The clusters lock: each colour strikes its own chord tone over a stab and an 808.
    issues.clusters.forEach((time, i) => blip(mix, time, CLUSTERS[Math.min(5, i)], .45, {...HIGH, pan: -.3 + Math.min(5, i) * .12}, .12, {exact: true, body: .8}));
    block(mix, lock, lock + .5, I.tones.map(t => t + 12), HIGH, {level: .55, cutoff: [5100, 1900]});
    sub808(mix, lock, 26, .8, .85, SUB, {drop: 30});
  }

  // ════ Chapter 5 — awe. The grid multiplies into millions: the kit keeps running over a D pedal while the chords
  // climb I – E/D – F♯m/D – A/D in 16ths, the data rains faster and higher, a hat roll, 200 ms of nothing, the logo.
  const logo = end.logo, rollEnd = logo - .2, swell = logo - .62;
  const climbBeats = Math.floor((swell - end.start) / Q * 4) / 4, quarter = climbBeats / 4, ladder = [I, onD(II), onD(iii), onD(V)];
  ladder.forEach((voiced, i) => {
    const from = end.start + i * quarter * Q, to = end.start + (i + 1) * quarter * Q - .02;
    chord(from, to, voiced, {level: .45 + i * .07, cutoff: [700 + i * 150, 900 + i * 100], pulse: true});
  });
  sub808(mix, end.start, 26, .9, .8, SUB, {drop: 24, drive: 1.6});
  trap(progression(...ladder.map((voiced, i) => [i * quarter, voiced] as [number, Voiced])), end.start, climbBeats, {level: .65});
  block(mix, swell, rollEnd, V.tones, BLOCK, {root: 26, level: .8, cutoff: [600, 2600], swell: true});
  riser(mix, swell - .6, rollEnd, 50, 74, .15, BLOCK, {every: Q / 4, route: KIT, level: .4});
  for (let t = end.start + .1; t < rollEnd - .02;) {
    const progress = (t - end.start) / (rollEnd - end.start);
    blip(mix, t, SCALE[Math.min(11, Math.floor(progress * 8 + mix.random() * 4))] + 12, .06 + .1 * progress, {...TEXTURE, room: .08, pan: (mix.random() - .5) * 1.6}, .018, {body: .15});
    t += 1 / (8 + 40 * progress ** 1.5);
  }
  // With Laminar: the hit is D1, a clap and a short bright octave over a dark Dmaj9♯11 (the voice owns the next second).
  // Once the name is said the chord blooms over four octaves, wide, with the D on top: the overflow.
  const named = VOICE.find(phrase => phrase.from > logo - .5)?.to ?? logo + 1.1, bloomEnd = end.end - .4;
  const DMAJ = [57, 66, 73, 76, 80], OCTAVE = [74, 78, 81, 85, 88, 92];
  sub808(mix, logo, 26, named - logo, 1, SUB, {drop: 34, drive: 3, decay: 2.2});
  clap(mix, logo, .9, KIT);
  block(mix, logo, named, DMAJ, BLOCK, {root: 38, level: .6, cutoff: [1300, 900]});
  block(mix, logo, logo + .12, OCTAVE, HIGH, {level: .5, cutoff: [5600, 2400]});
  // The whole motif flicks by before the voice's first syllable (120 ms after the hit), dry, then waits for the name.
  MOTIF.forEach((midi, i) => blip(mix, logo + i * .04, midi, .42, {...HIGH, delay: 0}, .05, {exact: true}));
  sub808(mix, named, 26, bloomEnd - named, 1, SUB, {drop: 24, drive: 3.2, decay: 1.6});
  clap(mix, named, .8, {...KIT, pan: .1});
  block(mix, named, bloomEnd, DMAJ, BLOCK, {root: 38, level: 1.4, cutoff: [2400, 5600]});
  [0, -.8, .8].forEach(pan => block(mix, named, bloomEnd, OCTAVE.map(t => t + pan * .15), {...HIGH, pan, delay: 0}, {level: pan ? .42 : .5, cutoff: [4000, 6400]}));
  motif(named + .02, .38, [93, 98], .12);
  // D7 answers itself three times, and that is the last sound.
  [-.4, .4, 0].forEach((pan, k) => blip(mix, named + .14 + (k + 1) * .22, 98, .3 * .55 ** (k + 1), {...HIGH, delay: 0, pan}, .06, {exact: true}));
}
