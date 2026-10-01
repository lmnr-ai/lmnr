import type {ScoreCues} from '../cues';
import {bass, hat, impact, kick, marker, pop, puff, reverseSwell, riser, snare, thock, tick, whoosh, type Mix, type Route, type WhooshOptions} from '../voices';
import {cascade} from '../writing';
import {air, blip, breeze, drone, feather, glint, haze, keys, shimmer, thump} from './instruments';

/*
 * "Glide" — the TurboPuffer reference's arc on the Ultimate 3 picture. No piano, no struck melody: an
 * airy G-major synth bed whose single timeline filter opens and closes with the story (bright on the
 * trace, slammed shut on the failure, dark under Cost, warm on Flow-1, glittering over the issue grid),
 * a muffled 89 BPM thump under the problem, silence before each reveal, and the only real beat — a soft
 * boom-bap on the same 89 BPM grid — held back for the conclusion, logo on beat 6.
 * Detail lives far above the voice (glints ≥ 4.7 kHz) or far below it (sub, thumps ≤ 1 kHz).
 */

const PAD: Route = {bus: 'music', hall: .45};
const AIR: Route = {bus: 'music', hall: .3};
const SUB: Route = {bus: 'music'};
const KIT: Route = {bus: 'music', room: .18, gain: .7};
const COMP: Route = {bus: 'music', hall: .25, delay: .18};
const FX: Route = {bus: 'sfx', hall: .25};
const SPECK: Route = {bus: 'sfx', hall: .4, delay: .2};
const FLOOR: Route = {bus: 'sfx', room: .25};
/** `glide-minimal`'s quieter kit, so the conclusion arrives about 2 dB softer. */
const SOFT_KIT: Route = {...KIT, gain: .55};
/**
 * `glide-minimal`'s answer to "with Laminar", in beats of the conclusion grid: the drums stay stopped under the brand
 * line, then G lands on beat 8 (just after the word), holds 3 beats and rests through a closing filter.
 */
const BUTTON = {hold: 3, release: 3, pad: .5, bass: .28, sub: .04, kick: .55, keys: .26, closeHz: 700};
/**
 * `glide-minimal` "lift" ending: the payoff lands ON the logo (beat 6), under "with Laminar", not after it.
 * The groove turns V (Dsus, beat 5) into I (Gmaj9 on the logo), the kit stops on one hit (kick + a long, bright
 * air "crash" + sub), the chord stays open and rings over the logo hold, and decays by level, not by a low-pass.
 * Times are in beats of the conclusion grid; `hold`/`subHold` end the logo chord/sub, `closeFrom` starts the last gentle close.
 */
const LIFT = {groovePad: .7, grooveTone: 4200, grooveKeys: .75, hats: 1.5, vRelease: .5, logoKick: .9, pad: .42, padTone: 6000, hold: 10, padRelease: 3.2,
  bass: .3, sub: .05, subHold: 9.5, crash: .14, crashHz: 9000, riser: .07, keys: .2, closeFrom: 14, closeHz: 3500};
/** The logo's G (over the G2 bass), voiced open and high (B5–D7): bright, and out of 500 Hz–1 kHz, where the bed masks the voice most. */
const Glogo = [83, 86, 90, 93, 98];
/**
 * `glide-minimal-linger`: the lift's groove does not stop on the logo; it plays the film out in 16 beats (4 bars, ending on
 * the bar line at the film's end). Beats 6–8 (logo, "with Laminar"): the logo hit (kick, bass, open G, a soft feather
 * bloom) and the groove keeps going as kick and hats only; nothing between 500 Hz and 4 kHz moves under the words.
 * Bar 3 (beats 8–12, after the words): the full groove returns over vi–IV (Em9, Cmaj9) with the keys comp and a ghost fill.
 * Bar 4 (beats 12–16): I (Gmaj9) on the downbeat with the last kick; the snare drops, the hats thin and fade, the chord,
 * sub and echoes decay by level so the file ends on the bar line on near silence. Levels are multipliers of the lift's.
 */
const LINGER = {hats: 1.5, hatsAfterLogo: 1.25, logoKick: .9, groovePad: .7, grooveTone: 4200, keys: .75, logoPad: .42, logoTone: 6000,
  barPad: .44, finalPad: .5, finalRelease: 2, bass: .23, sub: .035, tail: .05, afterWords: .66, endKick: .75, endSnare: .3, fill: .22, echo: .12};

// Voicings stay in G major / E minor, like the reference; the only foreign colour is Cost's F and B♭.
// One octave above the voice's body (G4–A5), so the bed is air and mid, not chest; the sub carries the floor.
const up = (notes: readonly number[]) => notes.map(midi => midi + 12);
const Gmaj9 = up([55, 59, 62, 66, 69]), Em9 = up([52, 55, 59, 62, 66]), Cmaj9 = up([52, 55, 59, 62, 64]), Dsus = up([50, 55, 57, 62, 66]);
const Am9 = up([57, 60, 64, 67, 71]), Fmaj7 = up([53, 57, 60, 64, 69]), Esus = up([52, 57, 59, 64]), Bbmaj7 = up([50, 53, 57, 62]);
const Gwarm = [55, 62, 66, 71, 74], GoverB = up([47, 55, 59, 62, 67]);
/** Glint scale: G-major pentatonic from D8 up — specks sit above the voice's presence band (≥ 4.7 kHz). */
const SPECKS = [110, 112, 115, 117, 119, 122, 124, 127];

type Knot = readonly [time: number, hz: number];
/** Log-linear interpolation through the knots; beyond the last knot the filter is fully open. */
const automation = (knots: readonly Knot[]) => (time: number) => {
  if (time <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (time <= knots[i][0]) {
    const [t0, h0] = knots[i - 1], [t1, h1] = knots[i], p = (time - t0) / Math.max(1e-6, t1 - t0);
    return h0 * (h1 / h0) ** p;
  }
  return knots[knots.length - 1][1];
};

/** The conclusion's tempo: beat 6 lands on the logo, which is ≈ 89 BPM like the reference groove. */
export const glideGrid = (cues: ScoreCues) => {
  const start = cues.conclusion.start, beat = (cues.conclusion.logo - start) / 6;
  return {beat, at: (n: number) => start + n * beat};
};

/** `minimal` is the `glide-minimal` cut: v1 with quieter mid-range under the voice and an ending that rests. */
export function composeGlide(mix: Mix, cues: ScoreCues, minimal = false, ending: 'rest' | 'lift' | 'linger' = 'rest') {
  const lift = minimal && ending === 'lift', linger = minimal && ending === 'linger';
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const shut = flow.coverShut, drop = end.start - .9, cmp = flow.comparison;
  const returnAt = cmp ? cmp.comparison_returnToGrid.at : flow.cameraToEngine.at;

  // --- Ultimate 2: one open chord that drifts; the filter tells the story.
  haze(mix, 0, u2.failure + .2, Gmaj9, PAD, {attack: 1.6, release: 1.2, level: 1});
  haze(mix, u2.failure, u2.highlight.at + .3, Em9, PAD, {attack: .5, release: 1.4, level: .9});
  haze(mix, u2.highlight.at, u2.zoom.at + u2.zoom.duration, Cmaj9, PAD, {attack: 1.2, release: 1.8, level: 1});
  haze(mix, u2.zoom.at + u2.zoom.duration - .4, cues.chapter.cost.start + .8, Dsus, PAD, {attack: 1.4, release: 1.6, level: .75});
  const u2Air = {hz: 3200, level: .05, shape: (p: number) => Math.min(1, p * 8) * (1 - p) ** .5};
  if (linger) feather(mix, 0, cues.chapter.cost.start + .5, AIR, u2Air);
  else air(mix, 0, cues.chapter.cost.start + .5, AIR, u2Air);

  // --- Cost: the floor drops to a sub drone under a dark, thin pad.
  haze(mix, cost.cloudOut.at, cost.powerful, Am9, PAD, {attack: 1.2, release: .8, level: .7, tone: 1600});
  haze(mix, cost.powerful, cost.budgetEntry.at, Fmaj7, PAD, {attack: .4, release: .8, level: .7, tone: 1500});
  haze(mix, cost.budgetEntry.at, cost.depletion.at, Esus, PAD, {attack: .4, release: .6, level: .65, tone: 1400});
  haze(mix, cost.depletion.at, cost.depletion.at + cost.depletion.duration, Bbmaj7, PAD, {attack: .3, release: .8, level: .6, tone: 1100});
  drone(mix, cost.cloudOut.at + .4, cost.powerful, 33, SUB, {level: .06, attack: 1.4});
  drone(mix, cost.powerful, cost.budgetEntry.at, 29, SUB, {level: .065, attack: .15});
  drone(mix, cost.budgetEntry.at, cost.depletion.at, 28, SUB, {level: .06, attack: .15});
  drone(mix, cost.depletion.at, cost.depletion.at + cost.depletion.duration, 34, SUB, {level: .06, toMidi: 30, attack: .12, release: .4});

  // --- "Until now": near-silence, then a reversed breath into the Flow-1 reveal.
  reverseSwell(mix, flow.reveal, 1.2, [55, 62, 66, 71], {...PAD, gain: .5});

  // --- Flow: warm, low-passed Gmaj7 (the reference's reveal voicing), walking G → Em → C → D → G.
  const numberFlow = flow.numberDrops[2];
  haze(mix, flow.reveal, numberFlow, Gwarm, PAD, {attack: .25, release: 1.2, level: 1.1, tone: 2200});
  haze(mix, numberFlow, cmp?.comparison_gridShrink.at ?? flow.cameraToEngine.at, Em9, PAD, {attack: .6, release: 1.2, level: minimal ? .7 : 1, tone: 2200});
  haze(mix, cmp?.comparison_gridShrink.at ?? flow.cameraToEngine.at, returnAt, Cmaj9, PAD, {attack: .6, release: 1, level: minimal ? .75 : 1, tone: 2400});
  haze(mix, returnAt, flow.moduleActivation, Dsus, PAD, {attack: .6, release: .6, level: .95, tone: 2600});
  haze(mix, flow.moduleActivation, shut + .1, Gmaj9, PAD, {attack: .2, release: .5, level: 1, tone: 2800});
  drone(mix, flow.reveal, numberFlow, 31, SUB, {level: .045, attack: .05, release: 1});

  // --- Issues: the room behind the Signals door, an ambient walk that brightens into the grid.
  const p = issues.prelude, grid = p.zoomOut.at;
  haze(mix, shut + .05, p.labels?.at ?? p.highlight, Em9, PAD, {attack: .9, release: 1.2, level: .9, tone: 1800});
  haze(mix, p.labels?.at ?? p.highlight, p.explanation?.at ?? grid, Cmaj9, PAD, {attack: .9, release: 1.2, level: .9, tone: 1900});
  haze(mix, p.explanation?.at ?? grid, grid, GoverB, PAD, {attack: .9, release: 1, level: .9, tone: 2000});
  haze(mix, grid, issues.native, Dsus, PAD, {attack: 1.4, release: .8, level: .9, tone: 3200});
  haze(mix, issues.native, issues.clusters[0] ?? issues.ready, Gmaj9, PAD, {attack: .3, release: 1, level: 1, tone: 3400});
  haze(mix, issues.clusters[0] ?? issues.ready, issues.messageSend, Em9, PAD, {attack: .3, release: .8, level: minimal ? .6 : .95, tone: 2800});
  haze(mix, issues.messageSend, drop + .5, Cmaj9, PAD, {attack: .3, release: .6, level: .9, tone: 2400});
  reverseSwell(mix, end.start, .85, [55, 59, 66, 69], {...PAD, gain: .55});

  // The one filter: every tonal layer so far rides the story's brightness.
  const zoomEnd = u2.zoom.at + u2.zoom.duration, depletionEnd = cost.depletion.at + cost.depletion.duration;
  mix.sweep(automation([
    [0, 1100], [u2.stream.at, 1500], [u2.failure - .05, 4200], [u2.failure + .12, 420], [u2.upwardTurn.at + .8, 1400],
    [u2.highlight.at, 1600], [zoomEnd, 6500], [u2.ifOnly, 2400], [cues.chapter.cost.start, 900],
    [cost.powerful, 1300], [cost.depletion.at, 1100], [depletionEnd, 260], [flow.reveal - .7, 300], [flow.reveal - .02, 1700],
    [flow.reveal + .15, 1900], [numberFlow, 2600], [returnAt, 4200], [shut - .05, 5200], [shut + .08, 650],
    [p.bashEntry.at, 900], [grid, 1800], [p.circleGrow.at + p.circleGrow.duration, 9000], [issues.clusters[0] ?? issues.ready, 6500],
    [issues.windowDown.at, 3000], [drop, 2200], [end.start - .6, 420], [end.start - .02, 2800], [end.start, 20_000],
  ]));
  if (linger) return composeLinger(mix, cues);

  // --- Conclusion: the payoff groove, on the logo's grid (≈ 89 BPM, swung 16ths).
  const {beat, at} = glideGrid(cues);
  const swing = (sixteenth: number) => at(sixteenth / 4 + (sixteenth % 2 ? .06 : 0));
  const total = Math.floor((end.end - end.start) / beat * 4);
  const tail = 24; // The kit drops out on the logo (beat 6), leaving "with Laminar" over a held chord.
  const kit = minimal ? SOFT_KIT : KIT;
  for (let s = 0; s < Math.min(total, tail + 1); s++) {
    const step = s % 16, time = swing(s);
    if (s === tail) { kick(mix, time, lift ? LIFT.logoKick : .6, kit); break; }
    if (step === 0 || step === 10 || (step === 7 && s > 16)) kick(mix, time, step === 0 ? .8 : .55, kit);
    if (step === 4 || step === 12) snare(mix, time, .55, kit, .35);
    // Lift: the hats carry the groove's top (≥ 8 kHz, far above the voice), and the last bar swells into the logo.
    const hats = lift ? LIFT.hats * (s >= 16 ? 1 + .35 * (s - 16) / 8 : 1) : 1;
    if (step % 2 === 0) hat(mix, time, (step % 4 === 0 ? .62 : .45) * hats, {...kit, pan: .18}, .024);
    else if (step === 15 || step === 11) hat(mix, time, .28 * hats, {...kit, pan: .18}, .02);
    if (step === 14) hat(mix, time, .42 * hats, {...kit, pan: -.2}, .12);
  }
  // Roots G2/E2/C2 stay under the voice's fundamental (~100–250 Hz).
  // Minimal drops the keys on beat 5.5, whose delay repeats land on "with La-".
  // Lift keeps the same four pads (same note counts, so the seeded sequence after it is unchanged): G, Em9, then a
  // Dsus (V) in the gap after "agent traces" that resolves to G (I) on the logo; the G holds and rings out.
  const chords: [number, number, readonly number[], number][] = lift ? [[0, 4, Gmaj9, 43], [4, 5, Em9, 40], [5, 6, Dsus, 38], [6, LIFT.hold, Glogo, 43]]
    : [[0, 4, Gmaj9, 43], [4, 6, Em9, 40], [6, 8, Cmaj9, 36], [8, minimal ? 8 + BUTTON.hold : (end.end - end.start) / beat, Gmaj9, 43]];
  for (const [from, to, tones, root] of chords) {
    if (lift && from === 6) {
      haze(mix, at(from), at(to), tones, PAD, {attack: .06, release: LIFT.padRelease, level: LIFT.pad, tone: LIFT.padTone});
      bass(mix, at(from), root, beat * 2, LIFT.bass, SUB, {glide: -1.5, drive: 1.6});
      continue;
    }
    const button = minimal && from === 8;
    haze(mix, at(from), at(to), tones, PAD, button ? {attack: .12, release: BUTTON.release, level: BUTTON.pad, tone: 2600}
      : {attack: .2, release: lift && from === 5 ? LIFT.vRelease : 1.2, level: lift ? LIFT.groovePad : from < 6 ? .8 : .5, tone: lift ? LIFT.grooveTone : from < 6 ? 3000 : 1800});
    bass(mix, at(from), root, button ? beat * 1.5 : Math.min(to - from, 2) * beat - .08, button ? BUTTON.bass : from < 6 ? minimal ? .32 : .4 : .22, SUB, {glide: -1.5, drive: 1.6});
    if (to - from >= 4 && from < 6) bass(mix, at(from + 2.5), root, beat * 1.3, .3, SUB, {drive: 1.6});
    if (from < (lift ? 5 : 6)) keys(mix, at(from), tones.slice(1), .3 * (lift ? LIFT.grooveKeys : 1), COMP, 1.1);
    if (to - from >= 2 && from < (minimal ? 4 : 6)) keys(mix, swing(from * 4 + 6), tones.slice(2), .2 * (lift ? LIFT.grooveKeys : 1), COMP, .7);
  }
  if (!minimal) return;
  if (lift) {
    // The sub swells under the logo and the brand line; after "Laminar" one soft keys bloom answers, then a high echo.
    drone(mix, at(6), at(LIFT.subHold), 31, SUB, {level: LIFT.sub, attack: .02, release: 2});
    keys(mix, at(8), Gmaj9.slice(2), LIFT.keys, COMP, 2.4);
    keys(mix, at(11), [86, 91], LIFT.keys * .35, COMP, 2);
    return;
  }
  // The answer to "with Laminar": the full chord, a sub under it, and two echoes of it rising as it rests.
  drone(mix, at(8), at(8 + BUTTON.hold), 31, SUB, {level: BUTTON.sub, attack: .03, release: BUTTON.release});
  keys(mix, at(8), Gmaj9.slice(1), BUTTON.keys, COMP, 2.2);
  keys(mix, at(10), Gmaj9.slice(3), BUTTON.keys * .55, COMP, 1.8);
  keys(mix, at(12), [86, 91], BUTTON.keys * .35, COMP, 2);
}

/** The `glide-minimal-linger` conclusion (see LINGER): the groove plays through the logo and out to the film's last bar line. */
function composeLinger(mix: Mix, cues: ScoreCues) {
  const {beat, at} = glideGrid(cues), end = cues.conclusion;
  const swing = (sixteenth: number) => at(sixteenth / 4 + (sixteenth % 2 ? .06 : 0));
  const steps = Math.min(64, Math.floor((end.end - end.start) / beat * 4 + 1e-6)), logo = 24, words = 32, last = 48;
  const late = {...SOFT_KIT, gain: (SOFT_KIT.gain ?? 1) * LINGER.afterWords};
  for (let s = 0; s < steps; s++) {
    const step = s % 16, time = swing(s), kit = s >= words ? late : SOFT_KIT;
    // Hats: the lift's swell into the logo, steady after it, and a fade over the last bar (the last one on beat 15).
    const fade = s >= last ? Math.max(0, 1 - (s - last) / 14) ** 1.3 : 1;
    const hats = (s < logo ? LINGER.hats * (s >= 16 ? 1 + .35 * (s - 16) / 8 : 1) : LINGER.hatsAfterLogo) * fade;
    if (s === logo) kick(mix, time, LINGER.logoKick, SOFT_KIT);
    else if (s === last) kick(mix, time, LINGER.endKick, kit);
    else if (s < last && (step === 0 || step === 10 || (step === 7 && s > 16))) kick(mix, time, step === 0 ? .8 : .55, kit);
    // No snare under "with Laminar" (beat 7 lands on "-mi-"); one soft backbeat in the last bar, then none.
    if ((step === 4 || step === 12) && (s < logo || (s >= words && s < last))) snare(mix, time, .55, kit, .35);
    if (s === last + 4) snare(mix, time, LINGER.endSnare, kit, .35);
    if (s === last - 2 || s === last - 1) snare(mix, time, LINGER.fill * (s === last - 1 ? 1.3 : 1), kit, .3);
    if (hats > 0 && s <= 60) {
      if (step % 2 === 0) hat(mix, time, (step % 4 === 0 ? .62 : .45) * hats, {...kit, pan: .18}, .024);
      else if ((step === 15 || step === 11) && s < last) hat(mix, time, .28 * hats, {...kit, pan: .18}, .02);
      if (step === 14 && s < last) hat(mix, time, .42 * hats, {...kit, pan: -.2}, .12);
    }
  }
  // Harmony: I – vi – V → I on the logo (the lift), then vi – IV after the words and I for the last bar.
  const comp = (from: number, tones: readonly number[], level = 1) => keys(mix, at(from), tones.slice(1), .3 * LINGER.keys * level, COMP, 1.1);
  const groove: [number, number, readonly number[], number][] = [[0, 4, Gmaj9, 43], [4, 5, Em9, 40], [5, 6, Dsus, 38], [8, 10, Em9, 40], [10, 12, Cmaj9, 36]];
  for (const [from, to, tones, root] of groove) {
    const after = from >= 8;
    haze(mix, at(from), at(to), tones, PAD, {attack: .2, release: from === 5 ? .5 : 1.2, level: after ? LINGER.barPad : LINGER.groovePad, tone: LINGER.grooveTone});
    bass(mix, at(from), root, Math.min(to - from, 2) * beat - .08, after ? LINGER.bass : .32, SUB, {glide: -1.5, drive: 1.6});
    if (to - from >= 4) bass(mix, at(from + 2.5), root, beat * 1.3, .3, SUB, {drive: 1.6});
    if (from < 5 || after) comp(from, tones);
    if (from === 0 || after) keys(mix, swing(from * 4 + 6), tones.slice(2), .2 * LINGER.keys, COMP, .7);
  }
  // The logo: open G over G2, held through the words, crossfading into bar 3.
  haze(mix, at(6), at(8), Glogo, PAD, {attack: .06, release: 1.4, level: LINGER.logoPad, tone: LINGER.logoTone});
  bass(mix, at(6), 43, beat * 2 - .08, LINGER.bass, SUB, {glide: -1.5, drive: 1.6});
  drone(mix, at(6), at(12), 31, SUB, {level: LINGER.sub, attack: .02, release: .6});
  // The last bar: I on the downbeat, decaying by level (raised-cosine release) to near silence on the bar line.
  haze(mix, at(12), at(12) + .25, Gmaj9, PAD, {attack: .05, release: LINGER.finalRelease, level: LINGER.finalPad, tone: 3600});
  // A short note, then a sine tail with a 1.9 s raised-cosine release so the low end decays instead of gating off.
  bass(mix, at(12), 43, beat * .9, LINGER.bass, SUB, {glide: -1.5, drive: 1.6});
  drone(mix, at(12) + .1, at(12) + beat * .9, 43, SUB, {level: LINGER.tail, attack: .3, release: 1.9});
  comp(12, Gmaj9, 1.1);
  keys(mix, at(13.5), [83, 86], LINGER.echo, COMP, 1.2);
  keys(mix, at(14.5), [86, 91], LINGER.echo * .6, COMP, 1);
}

export function designGlide(mix: Mix, cues: ScoreCues, minimal = false, ending: 'rest' | 'lift' | 'linger' = 'rest') {
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const cmp = flow.comparison;
  // Linger swaps every noise move for the soft palette (pink, low-Q, no band-pass) and the clicking counters for pure blips.
  const linger = minimal && ending === 'linger';
  const move = (time: number, duration: number, route: Route, options: WhooshOptions) => linger ? breeze(mix, time, duration, route, options) : whoosh(mix, time, duration, route, options);
  const swipe = (time: number, duration: number, route: Route, level: number) => linger
    ? breeze(mix, time, duration, route, {from: 900, to: 2400, level, peak: .35, air: .5, panFrom: -.3, panTo: .3}) : marker(mix, time, duration, route, level);
  const breath = (start: number, endAt: number, route: Route, options: Parameters<typeof air>[4]) => linger ? feather(mix, start, endAt, route, options) : air(mix, start, endAt, route, options);
  const count = (time: number, midi: number, velocity: number, route: Route, decay?: number) => linger ? blip(mix, time, midi, velocity, route, decay) : tick(mix, time, midi, velocity, route, decay);
  const speck = (time: number, index: number, velocity: number, pan = 0, decay = .05) => glint(mix, time, SPECKS[Math.max(0, Math.min(SPECKS.length - 1, index))], velocity, {...SPECK, pan}, decay);
  const stream = (start: number, endAt: number, spacing: [number, number], velocity: number, panFrom: number, panTo: number, rise = 0, decay = .025) => {
    for (let time = start; time < endAt;) {
      const p = (time - start) / Math.max(.01, endAt - start);
      speck(time, Math.floor(mix.random() * 5 + rise * p * 4), velocity * (.6 + .4 * mix.random()), panFrom + (panTo - panFrom) * p, decay);
      time += spacing[0] + (spacing[1] - spacing[0]) * mix.random();
    }
  };

  // --- Ultimate 2
  speck(u2.agentEnter + .05, 4, .5, -.2, .12);
  stream(u2.firstThinking.at, u2.firstThinking.at + u2.firstThinking.duration, [.1, .18], .35, -.3, .1);
  stream(u2.stream.at, u2.stream.at + u2.stream.duration, [.06, .13], .42, -.6, .6, 1);
  thump(mix, u2.failure, .9, FLOOR, .9);
  puff(mix, u2.failure + .02, .5, FX, 500);
  move(u2.upwardTurn.at, u2.upwardTurn.duration, FX, {from: 300, to: 1400, level: .12, panFrom: .3, panTo: -.2});
  move(u2.backtrack.at, u2.backtrack.duration, FX, {from: 1200, to: 350, level: .11, panFrom: .4, panTo: -.4});
  u2.drawers.forEach((time, i) => speck(time, 2 + i * 2, .55, -.3 + i * .3, .09));
  swipe(u2.highlight.at, u2.highlight.duration, FX, .1);
  thump(mix, u2.warning, .55, FLOOR, 1.2);
  speck(u2.warning + .01, 1, .5, .2, .2);
  [0, 2, 4, 6].forEach((index, i) => speck(u2.insights + i * .07, index, .45 - i * .05, -.4 + i * .27, .12));
  move(u2.zoom.at, u2.zoom.duration, FX, {from: 250, to: 1800, level: .1, peak: .8, air: .6});
  // Linger: half as many, softer, longer specks over the zoom, so it sparkles instead of pouring.
  if (linger) stream(u2.zoom.at + u2.zoom.duration * .5, u2.zoom.at + u2.zoom.duration, [.12, .22], .24, -.5, .5, 1, .05);
  else stream(u2.zoom.at + u2.zoom.duration * .5, u2.zoom.at + u2.zoom.duration, [.05, .11], .3, -.5, .5, 1);
  puff(mix, u2.collapse.at, .35, FX, 700);
  move(u2.cloudIn.at + u2.cloudIn.duration - 1.6, 1.6, FX, {from: 400, to: 1100, level: .08, air: .5});
  speck(u2.ifOnly, 6, .4, 0, .3);

  // --- Cost: the muffled pulse (syncopated 8ths on the 89 BPM grid), zips, and the budget running dry.
  const {beat, at} = glideGrid(cues);
  const firstEighth = Math.ceil((cost.cloudOut.at + cost.cloudOut.duration * .5 - end.start) / beat * 2);
  const lastEighth = Math.floor((cost.depletion.at - end.start) / beat * 2);
  for (let e = firstEighth; e < lastEighth; e++) {
    const step = ((e % 8) + 8) % 8, velocity = step === 0 ? .8 : step === 3 ? .5 : step === 6 ? .62 : step === 7 ? .22 : 0;
    if (velocity) thump(mix, at(e / 2), velocity, FLOOR, step === 0 ? .9 : 1);
  }
  [0, .55, 1.25].forEach((offset, i) => thump(mix, cost.depletion.at + offset, .6 - i * .16, FLOOR, .85 - i * .08));
  move(cost.cloudOut.at, cost.cloudOut.duration, FX, {from: 900, to: 300, level: .09, air: .5, panFrom: -.2, panTo: .4});
  cost.cheapLegs.forEach(leg => move(leg.at, leg.duration, FX, {from: 700, to: 2200, level: .1, q: 1.6, peak: .5,
    panFrom: leg.direction === 'leftToRight' ? -.6 : .6, panTo: leg.direction === 'leftToRight' ? .6 : -.6}));
  speck(cost.missIssues, 3, .4, 0, .2);
  speck(cost.missIssues + .14, 1, .3, 0, .25);
  move(cost.cameraToBash.at, cost.cameraToBash.duration, FX, {from: 1300, to: 350, level: .1});
  thump(mix, cost.bashEntry.at + cost.bashEntry.duration * .6, .4, FLOOR, 1.3);
  count(cost.bashStop, 112, .3, SPECK);
  impact(mix, cost.powerful, .22, FLOOR);
  if (linger) breeze(mix, cost.bashExpand, .8, FX, {from: 400, to: 1400, level: .045, peak: .4});
  else air(mix, cost.bashExpand, cost.bashExpand + .8, FX, {hz: 1200, level: .06});
  for (let i = 0; i < 8; i++) speck(cost.bashDescent.at + i * cost.bashDescent.duration / 8, 7 - i, .25, .3 - i * .08, .03);
  swipe(cost.bashHighlight.at, cost.bashHighlight.duration, FX, .09);
  thump(mix, cost.bashWarning, .45, FLOOR, 1.25);
  move(cost.cameraToBudget.at, cost.cameraToBudget.duration, FX, {from: 1200, to: 320, level: .1});
  thump(mix, cost.budgetEntry.at + cost.budgetEntry.duration * .6, .38, FLOOR, 1.3);
  puff(mix, cost.smokeEnter, .45, FX, 650);
  speck(cost.budgetAppear, 5, .4, 0, .12);
  for (let time = cost.budgetRun.at, i = 0; time < cost.budgetRun.at + cost.budgetRun.duration; time += .06, i++) count(time, 112 + (i % 5), .16, SPECK, .008);
  move(cost.depletion.at, cost.depletion.duration, FX, {from: 900, to: 180, level: .07, peak: .3});

  // --- Flow
  impact(mix, flow.reveal, .4, FLOOR);
  flow.numberDrops.forEach((time, i) => {
    const flowOne = i === 2;
    // Minimal plays Flow-1's chord softly and dry: it lands mid-sentence, in the voice's band.
    const quiet = minimal && flowOne;
    keys(mix, time, flowOne ? [74, 79, 83] : [[74], [76], [], [79], [81], [83]][i], quiet ? .18 : flowOne ? .5 : .3, {...COMP, bus: 'sfx', pan: -.5 + i * .2, delay: quiet ? 0 : COMP.delay}, flowOne ? 1.4 : .6);
    if (flowOne) thump(mix, time, .45, FLOOR, 1.1);
  });
  move(flow.cameraZoom.at, flow.cameraZoom.duration, FX, {from: 300, to: 1500, level: .09, air: .5});
  move(flow.cloudExit.at, flow.cloudExit.duration, FX, {from: 800, to: 400, level: .06, air: .6});
  for (let time = flow.countUp.at, i = 0; time < flow.countUp.at + flow.countUp.duration; time += .05, i++) count(time, 110 + Math.min(9, i >> 1), .14, SPECK, .008);
  speck(flow.benchmark, 6, .35, 0, .15);
  if (cmp) {
    move(cmp.comparisonExit.at, cmp.comparisonExit.duration + .15, FX, {from: 1100, to: 400, level: .08});
    const shrink = cmp.comparison_gridShrink;
    if (linger) breeze(mix, shrink.at, shrink.duration + .3, FX, {from: 1100, to: 450, level: .05, peak: .3});
    else air(mix, shrink.at, shrink.at + shrink.duration + .3, FX, {hz: 5500, q: .6, level: .06});
    speck(cmp.comparison_headlineReveal.at + .05, 5, .3, 0, .15);
    // GPT-5.5's few orange dots: a short warm flutter.
    const orange = cmp.comparison_orangeDots;
    for (let i = 0; i < 6; i++) speck(orange.at + i * orange.duration / 6, i % 3, .3, .45, .04);
    thump(mix, cmp.comparison_gptNumber.at, .32, FLOOR, 1.35);
    // Flow-1's many blue dots: a dense bright shower that fills the width, all above the voice.
    shimmer(mix, cmp.comparison_blueDots.at, cmp.comparison_blueDots.at + cmp.comparison_blueDots.duration, SPECKS.slice(2), {...SPECK, bus: 'sfx'}, {level: .32, density: [28, 70], soft: linger});
    keys(mix, cmp.comparison_flowNumber.at, [79, 83, 86, 90], minimal ? .22 : .34, {...COMP, bus: 'sfx'}, 1.6);
    thump(mix, cmp.comparison_flowNumber.at, .4, FLOOR, 1.1);
    const back = cmp.comparison_returnToGrid;
    move(back.at, back.duration, FX, {from: 300, to: 1600, level: .1, peak: .75, air: .6, panFrom: -.3, panTo: .3});
    const rise = back.at + back.duration * .3;
    if (linger) breeze(mix, rise, flow.moduleActivation - rise, FX, {from: 400, to: 2200, level: .016, peak: .97});
    else riser(mix, rise, flow.moduleActivation, FX, {level: .05, fromMidi: 55, toMidi: 67});
  }
  thump(mix, flow.moduleActivation, .5, FLOOR, 1.1);
  keys(mix, flow.moduleActivation, [79, 83, 86], .3, {...COMP, bus: 'sfx'}, 1);
  for (let time = flow.engineSpinner.at, i = 0; time < flow.engineSpinner.at + flow.engineSpinner.duration; time += .1, i++) count(time, 115 + (i % 2) * 2, .12, SPECK, .01);
  move(flow.cover.at, flow.cover.duration, FX, {from: 1000, to: 260, level: .09});
  thump(mix, flow.coverShut, 1, FLOOR, .8);
  thock(mix, flow.coverShut, .5, FX, .8);

  // --- Issues
  const p = issues.prelude;
  thump(mix, p.bashEntry.at + p.bashEntry.duration * .6, .35, FLOOR, 1.3);
  count(p.bashStop, 112, .25, SPECK);
  for (let i = 0; i < 8; i++) speck(p.descent.at + i * p.descent.duration / 8, 7 - i, .22, .3 - i * .08, .03);
  swipe(p.highlight, .5, FX, .08);
  if (p.bubble !== undefined) { pop(mix, p.bubble, 84, .35, FX); speck(p.bubble + .03, 6, .3, 0, .12); }
  if (p.labels) for (let i = 0; i < 4; i++) speck(p.labels.at + i * p.labels.duration / 4, 3 + i, .25, -.3 + i * .2, .06);
  if (p.explanation) stream(p.explanation.at, p.explanation.at + p.explanation.duration, [.07, .12], .18, -.2, .2);
  move(p.zoomOut.at, p.zoomOut.duration, FX, {from: 900, to: 300, level: .08, air: .6});
  puff(mix, p.collapse, .35, FX, 700);
  shimmer(mix, p.circleGrow.at - .6, issues.native, SPECKS, SPECK, {level: .26, density: [6, 34], soft: linger});
  move(p.scaleOut, .5, FX, {from: 600, to: 1600, level: .06});
  for (const note of cascade(issues.pops, SPECKS.slice(1), .018)) speck(note.time, SPECKS.indexOf(note.midi), .3, note.pan, .07);
  move(issues.travel.at, issues.travel.duration, FX, {from: 500, to: 1200, level: .06, peak: .5, air: .6});
  speck(issues.ready, 4, .3, 0, .15);
  if (issues.clusters.length) {
    keys(mix, issues.clusters[0], [71, 74, 78, 83], minimal ? .2 : .32, {...COMP, bus: 'sfx'}, 1.4);
    thump(mix, issues.clusters[0], .4, FLOOR, 1.1);
  }
  move(issues.windowDown.at, issues.windowDown.duration, FX, {from: 1100, to: 350, level: .08});
  thock(mix, issues.windowShut, .45, FX);
  pop(mix, issues.issueBadge, 86, .3, FX);
  move(issues.messageSend, .35, FX, {from: 500, to: 2000, level: .07, peak: .7, panFrom: -.2, panTo: .4});
  pop(mix, issues.queryBadge, 88, .3, FX);
  move(issues.windowUp.at, issues.windowUp.duration, FX, {from: 400, to: 1300, level: .07});

  // --- Conclusion: the logo lands as light, not a stab — any mid-range hit masks "with Laminar".
  [0, 2, 4, 6].forEach((index, i) => speck(end.logo + i * .045, index, .32 - i * .04, -.3 + i * .2, .35));
  if (!minimal) { breath(end.logo - beat, end.end, FX, {hz: 6500, q: .5, level: .03, shape: q => Math.min(1, q * 4) * (1 - q)}); return; }
  if (ending === 'linger') {
    // A breath into the logo (after "traces"), a feather bloom on it instead of a hiss crash, light glints after "Laminar",
    // and a gentle close over the last three beats so the hall tails recede with the chord.
    breeze(mix, at(5), end.logo - at(5) + .05, FX, {from: 500, to: 2400, level: .04, peak: .93, air: .4});
    feather(mix, end.logo, at(12), {...FX, hall: .35}, {hz: 8500, level: .07, shape: q => Math.min(1, q * 150) * Math.exp(-q * 4.5)});
    [1, 3, 5, 7].forEach((index, i) => speck(at(8) + i * .06, index, .24 - i * .03, -.3 + i * .2, .4));
    mix.sweep(automation([[at(13), 20_000], [at(13) + .01, 16_000], [end.end, 2400]]));
    return;
  }
  if (ending === 'lift') {
    // A reversed-air swell pulls into the logo; the logo is the hit (a long bright air "crash"), light glints after "Laminar",
    // and only the last beats close gently so the hall tail doesn't cut at the end of the file.
    breath(at(4.5), end.logo, FX, {hz: 7000, q: .5, level: LIFT.riser, shape: q => q ** 2.5});
    breath(end.logo, end.end, {...FX, hall: .4}, {hz: LIFT.crashHz, q: .4, level: LIFT.crash, shape: q => Math.min(1, q * 300) * Math.exp(-q * 5)});
    [1, 3, 5, 7].forEach((index, i) => speck(at(8) + i * .06, index, .24 - i * .03, -.3 + i * .2, .4));
    mix.sweep(automation([[at(LIFT.closeFrom), 20_000], [at(LIFT.closeFrom) + .01, 16_000], [end.end, LIFT.closeHz]]));
    return;
  }
  // The answer on beat 8 rises in light, then everything rests through a low-pass closing to beat 15.5.
  [1, 3, 5, 7].forEach((index, i) => speck(at(8) + i * .06, index, .3 - i * .04, -.3 + i * .2, .4));
  kick(mix, at(8), BUTTON.kick, SOFT_KIT);
  breath(end.logo - beat, at(14), FX, {hz: 6500, q: .5, level: .03, shape: q => Math.min(1, q * 4) * (1 - q) ** 1.5});
  mix.sweep(automation([[at(10), 20_000], [at(10.01), 12_000], [at(15.5), BUTTON.closeHz]]));
}
