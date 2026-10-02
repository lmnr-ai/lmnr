import type {ScoreCues} from '../cues';
import {beatOf, gridOf} from '../style';
import {bell, clap, hat, kick, pad, pluck, shaker, snare, type Mix, type Pump, type Route} from '../voices';
import {cascade, chordAt, loopBars, type Chord, type Progression} from '../writing';
import {synthBass} from '../city-pop/instruments';

/*
 * "Sunlit synth" — F major chillwave-pop in the Tycho vein. A 16th analog arp through the dotted-eighth echo
 * rides a pumping pad and a driving eighth-note bass; the arp's filter opens bar by bar toward Flow-1, where the
 * kit fills in and a glassy lead takes the hook. The lift comes from motion and top end, not level: the voice's
 * band only ever gets short plucks, never a sustained mid-range line.
 */

const ARP: Route = {bus: 'music', hall: .12, delay: .3};
const LEAD: Route = {bus: 'music', hall: .26, delay: .24, pan: .12};
const GLASS: Route = {bus: 'music', hall: .34, delay: .22};
const BED: Route = {bus: 'music', hall: .3};
const KIT: Route = {bus: 'music', room: .1};
const DRUM: Route = {...KIT, gain: .75};
const LOW: Route = {bus: 'music', gain: .5};

const Fmaj9: Chord = {bass: 41, tones: [57, 60, 64, 67]}, Am7: Chord = {bass: 45, tones: [55, 60, 64, 69]};
const Bbmaj9: Chord = {bass: 46, tones: [57, 60, 62, 65]}, C9sus: Chord = {bass: 48, tones: [58, 62, 65, 67]};
const C6: Chord = {bass: 48, tones: [57, 60, 64, 67]}, Dm9: Chord = {bass: 38, tones: [57, 60, 64, 65]};
const Gm9: Chord = {bass: 43, tones: [58, 62, 65, 69]}, FoverA: Chord = {bass: 45, tones: [57, 60, 65, 69]};
const EASY = [Fmaj9, Am7, Bbmaj9, C9sus], SHINE = [Bbmaj9, C6, Am7, Dm9], DOOR = [Gm9, Bbmaj9, FoverA, C9sus];
/** Arp order through the four-note voicing an octave up, eight 16ths long. */
const ORDER = [0, 1, 2, 3, 2, 1, 3, 2];
/** The hook over IV → V: falling F – E – D – C, then climbing back to the G. */
const HOOK = [[0, 77, .5], [.5, 76, .5], [1, 74, .75], [1.75, 72, 1.25], [3, 74, .5], [3.5, 76, .5], [4, 79, .75], [4.75, 76, .75], [5.5, 72, 1], [6.5, 74, .5], [7, 76, 1]] as const;
const THEME = [[0, 72, .5], [.5, 74, .5], [1, 77, 1], [2, 76, 2]] as const;

const lastBar = (bars: Progression, chord: Chord): Progression => bars.map(([beat, c], i) => [beat, i === bars.length - 1 ? chord : c] as const);

export function composeSunlit(mix: Mix, cues: ScoreCues) {
  const g = (beat: number) => gridOf(cues, beat);
  const at = (time: number, division = 2) => beatOf(cues, time, division);
  const beatAt = (time: number) => (time - g(0)) / .5;
  const u2 = cues.ultimate2, cost = cues.cost, flow = cues.flow, issues = cues.issues, end = cues.conclusion;
  const drop = at(flow.reveal, 1), shut = flow.coverShut, shutBeat = beatAt(shut);
  const home = drop + 4 * Math.round((beatAt(issues.native) - drop) / 4), logo = at(end.logo, 1);
  const pump: Pump = {origin: g(0), period: .5, depth: .5};

  const glass = (time: number, notes: readonly number[], step: number, velocity: number, pan = 0) =>
    notes.forEach((midi, i) => bell(mix, time + i * step, midi, velocity, {...GLASS, pan: pan - .3 + .6 * i / Math.max(1, notes.length - 1)}, {decay: .9, ratio: 3.5, index: .9}));
  /** The lead: a round pluck with a sine-glass octave above it. */
  const lead = (time: number, midi: number, velocity: number, length: number, pan = .12) => {
    pluck(mix, time, midi, velocity, {...LEAD, pan}, {decay: .18 + length * .22, bright: .42});
    bell(mix, time + .004, midi + 12, velocity * .5, {...LEAD, pan: -pan}, {decay: .5 + length * .3, ratio: 1, index: .45});
  };
  const phrase = (beat: number, notes: readonly (readonly [number, number, number])[], velocity: number, shift = 0) =>
    notes.forEach(([b, midi, length]) => lead(g(beat + b), midi + shift, velocity, length * .5));
  const run = (time: number, notes: readonly number[], step: number, velocity: number, pan = 0) =>
    notes.forEach((midi, i) => pluck(mix, time + i * step, midi, velocity, {...ARP, pan: pan + (i % 2 ? .15 : -.15)}, {decay: .12, bright: .55}));

  /** The arp: every 16th, its filter opening from `open[0]` to `open[1]` across the span. */
  const arp = (bars: Progression, from: number, to: number, open: [number, number], velocity: number) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const beat = step / 4, [, chord] = chordAt(bars, beat), s = ((step - drop * 4) % 16 + 16) % 16;
      const progress = (beat - from) / Math.max(1, to - from), bright = open[0] + (open[1] - open[0]) * progress;
      const midi = chord.tones[ORDER[s % 8]] + 12;
      pluck(mix, g(beat), midi, velocity * (s % 4 === 0 ? 1.15 : s % 2 ? .8 : 1), {...ARP, pan: s % 2 ? .28 : -.28}, {decay: .085, bright});
    }
  };
  const bed = (bars: Progression, to: number, level: number, cutoff: [number, number] = [500, 1300]) => bars.forEach(([beat, chord], i) => {
    const next = Math.min(to, i + 1 < bars.length ? bars[i + 1][0] : to);
    if (beat < to) pad(mix, g(beat), g(next), chord.tones, BED, {attack: .08, release: .5, cutoff, level, pump});
  });
  /** Bass: quarter-notes while it builds, driving staccato eighths with an octave pop once it is full. */
  const bassline = (bars: Progression, from: number, to: number, full: boolean) => {
    for (let eighth = Math.ceil(from * 2 - 1e-9); eighth < to * 2 - 1e-9; eighth++) {
      const beat = eighth / 2, [, chord] = chordAt(bars, beat), e = ((eighth - drop * 2) % 8 + 8) % 8;
      if (!full && e % 2) continue;
      const root = chord.bass - 12 < 28 ? chord.bass : chord.bass - 12;
      synthBass(mix, g(beat), root + (full && e === 7 ? 12 : 0), full ? .2 : .38, full ? (e % 2 ? .36 : .46) : .4, LOW, {bright: full ? .45 : .3});
    }
  };
  /** Tier 0: offbeat hats alone; 1 adds the half-note kick; 2 adds the clap and 16th shaker; 3 is the full kit. */
  const kit = (from: number, to: number, tier: 0 | 1 | 2 | 3, level = 1) => {
    for (let step = Math.ceil(from * 4 - 1e-9); step < to * 4 - 1e-9; step++) {
      const t = g(step / 4) + (mix.random() - .5) * .004, s = ((step - drop * 4) % 16 + 16) % 16;
      if (tier && (s === 0 || s === 8) || (tier === 3 && (s === 6 || s === 11))) kick(mix, t, (s === 0 ? .34 : .28) * level, DRUM);
      if (s % 4 === 2) hat(mix, t, (tier < 2 ? .13 : .17) * level, {...KIT, pan: .22}, tier === 3 ? .045 : .03);
      if (tier === 3 && s % 2) hat(mix, t, .06 * level, {...KIT, pan: .3}, .014);
      if (tier >= 2 && s % 2 === 0) shaker(mix, t, (s % 4 ? .08 : .05) * level, {...KIT, pan: -.3});
      if (tier >= 2 && (s === 4 || s === 12)) {
        clap(mix, t, (tier === 3 ? .2 : .15) * level, {...KIT, hall: .14});
        if (tier === 3) snare(mix, t, .18 * level, {...KIT, pan: -.05}, .7);
      }
    }
  };

  // ── You build agents: F major 9 swelling in, a glass note over it.
  pad(mix, u2.agentEnter, g(at(u2.stream.at)), [41, 57, 60, 64, 67], BED, {attack: 1.5, release: 1, cutoff: [400, 1200], level: .8});
  glass(u2.agentEnter + .6, [84, 88], .18, .2, .2);

  // ── From the first trace the arp starts; the kit fills in on the insights; the last bar leans on C9sus.
  const from = at(u2.stream.at), insights = at(u2.insights, 1), depletion = at(cost.depletion.at);
  const easy = lastBar(loopBars(from, drop, EASY, drop), C9sus);
  arp(easy, from, drop, [.18, .6], .24);
  bed(easy, drop, .55);
  bassline(easy, Math.ceil(from), depletion, false);
  kit(Math.ceil(from), insights, 1);
  kit(insights, depletion, 2, .9);

  // ── When your agent fails: a falling run; the upward turn climbs; the backtrack is glass rewinding.
  run(u2.failure, [84, 81, 79, 76, 72], .07, .24);
  run(u2.upwardTurn.at + .1, [69, 72, 76, 79], u2.upwardTurn.duration / 4, .22, -.1);
  glass(u2.backtrack.at, [96, 93, 91, 88, 84, 81], .05, .14);
  u2.drawers.forEach((time, i) => lead(time, [72, 76, 79][i], .24 + i * .03, .6, -.2 + i * .2));
  glass(u2.highlight.at, [91], 0, .18, .25);

  // ── The insights: the lead's motif; the zoom is glass drifting up; "if only" leaves a G hanging.
  phrase(insights + 1, THEME, .26);
  glass(u2.zoom.at + .4, [72, 76, 79, 81, 84, 88, 91, 93], (u2.zoom.duration - .4) / 8, .11);
  glass(u2.ifOnly + .1, [91], 0, .2, .3);

  // ── Cheap LLMs: a quick run per pass; the miss droops. Powerful LLMs: a bass-and-kick hit on the bash window.
  cost.cheapLegs.forEach(leg => run(leg.at, leg.direction === 'leftToRight' ? [76, 79, 81, 84] : [84, 81, 79, 76], leg.duration / 4, .2, leg.direction === 'leftToRight' ? -.3 : .3));
  run(cost.missIssues + .1, [79, 74], .25, .22);
  synthBass(mix, cost.bashStop, 34, .5, .45, LOW, {bright: .5});
  kick(mix, cost.bashStop, .3, DRUM);
  glass(cost.budgetAppear, [88], 0, .18, -.1);

  // ── …but the costs are unsustainable: the kick drops out and the bass holds; the lead sinks.
  // Until now: two bars of building 16th snare, soft, into the drop.
  [[0, 81], [1, 79], [2, 76], [3, 72]].forEach(([b, midi]) => lead(g(depletion + b), midi, .24, .5, .2));
  easy.forEach(([beat, chord], i) => {
    const start = Math.max(beat, depletion), stop = i + 1 < easy.length ? easy[i + 1][0] : drop;
    if (stop > start) synthBass(mix, g(start), chord.bass - 12 < 28 ? chord.bass : chord.bass - 12, (stop - start) * .5 - .05, .38, LOW, {bright: .25});
  });
  kit(depletion, drop - 2, 0, .8);
  for (let step = 0; step < 16; step++) snare(mix, g(drop - 4 + step / 4), .03 + .1 * (step / 15) ** 2, {...KIT, pan: -.1 + step * .012, hall: .1}, .5);

  // ── Introducing Flow-1: the full kit, eighth bass, the arp wide open and the hook.
  const shine = loopBars(drop, shutBeat, SHINE, drop);
  kick(mix, flow.reveal, .36, DRUM);
  glass(flow.reveal, [84, 89, 93], .06, .2);
  arp(shine, drop, shutBeat, [.7, .8], .24);
  bed(shine, shutBeat, .6, [600, 1600]);
  bassline(shine, drop, shutBeat, true);
  kit(drop, shutBeat, 3);
  phrase(drop, HOOK, .28);
  // Matching Sonnet-5 at 2% of the cost: glass on the zoom; bead landings climb (flow-1's, the third, rings), the bars glissando.
  glass(flow.cameraZoom.at, [84, 89], .12, .18);
  if (flow.animation21) {
    flow.numberDrops.forEach((time, i) => bell(mix, time, [81, 84, 86, 89, 91, 93][i], i === 2 ? .26 : .17, {...GLASS, pan: -.3 + i * .12}, {decay: i === 2 ? 1.6 : .8, ratio: 3.5, index: .9}));
    lead(flow.numberDrops[2], 77, .26, 1, 0);
  } else lead(flow.numberSwap.at, 77, .28, 1, 0);
  glass(flow.barsGrow.at, [72, 74, 76, 77, 79, 81, 84, 86, 88], flow.barsGrow.duration / 9, .17);
  // Flow-1 powers Signals: the motif a fifth up; the door shuts on a kick and C9sus glass.
  phrase(at(flow.cameraToEngine.at, 1), THEME, .26, 7);
  kick(mix, shut, .3, DRUM);
  glass(shut, [79, 82, 86], .04, .18);

  // ── Our agent, built to analyze traces at scale: behind the door, clap and shaker, the arp half-open.
  const door = lastBar(loopBars(Math.ceil(shutBeat + .5), home, DOOR, home), C9sus), p = issues.prelude;
  arp(door, door[0][0], home, [.35, .6], .23);
  bed(door, home, .5);
  bassline(door, door[0][0], home, false);
  kit(door[0][0], home - 1, 2);
  for (let step = 0; step < 4; step++) snare(mix, g(home - 1 + step / 4), .05 + .05 * step, {...KIT, pan: -.1 + step * .06}, .5);
  synthBass(mix, p.bashStop, 36, .4, .4, LOW, {bright: .4});
  glass(p.descent.at, [96, 93, 91, 88, 84, 81, 79, 76], p.descent.duration / 8, .13);
  lead(p.highlight, 84, .24, .8, .2);
  // "At scale": glass climbs with the zoom out; the motif grows with the circle; the scale-out is the pickup home.
  glass(p.zoomOut.at, [69, 72, 74, 77, 79, 81, 84, 86, 89, 91], p.zoomOut.duration / 10, .11);
  phrase(at(p.circleGrow.at, 1), THEME, .25);
  run(p.scaleOut, [72, 74, 77, 79, 81], .07, .2, -.2);

  // ── It finds deep issues, in every trace: the full groove again; the last bar leans on C9sus.
  const homeBars = lastBar(loopBars(home, logo, SHINE, logo), C9sus);
  arp(homeBars, home, logo, [.65, .85], .24);
  bed(homeBars, logo, .6, [600, 1600]);
  bassline(homeBars, home, logo, true);
  kit(home, logo - 1, 3);
  if (issues.postludeActive) {
    // Issue triangles land as glass, falling down the pentatonic.
    cascade(issues.pops, [74, 77, 79, 81, 84, 86, 89, 91, 93]).forEach((note, i) =>
      bell(mix, note.time, note.midi, .2 - i * .008, {...GLASS, pan: note.pan * .85}, {decay: .8, ratio: 3.5, index: .9}));
    // …and clusters them into patterns: the chord in glass on the lock; ready for you, the lead settles.
    const [, locked] = chordAt(homeBars, beatAt(issues.clusters[0]));
    glass(issues.clusters[0], locked.tones.map(t => t + 24), .03, .16);
    const ready = at(issues.ready, 1);
    [[0, 76, 1.5], [1.5, 74, .5], [2, 72, 2]].forEach(([b, midi, length]) => lead(g(ready + b), midi, .24, length * .5, .2));
  }

  // ── Unlock the insights: the hook again, a fill into the logo.
  phrase(at(end.start, 1) + .5, HOOK.slice(0, 7), .26);
  for (let n = 0; n < 4; n++) snare(mix, g(logo - 1 + n * .25), .1 + n * .05, {...KIT, pan: -.2 + n * .12}, .7);

  // ── With Laminar: F major 9 — kick, bass and the pad; the arp keeps spinning into the echo and fades.
  kick(mix, end.logo, .36, DRUM);
  synthBass(mix, end.logo, 29, 1.8, .5, LOW, {bright: .3});
  pad(mix, end.logo, end.end - 1.2, [41, 53, 57, 60, 64, 67, 72], BED, {attack: .05, release: 1.4, cutoff: [1400, 500], level: .9});
  const tail = [69, 72, 76, 79, 76, 72, 76, 79, 84, 79, 76, 72, 76, 79, 84, 88];
  tail.forEach((midi, i) => pluck(mix, end.logo + i * .125, midi, .22 * (1 - i / tail.length) ** 1.5, {...ARP, pan: i % 2 ? .3 : -.3}, {decay: .1, bright: .7 - i * .025}));
  glass(end.logo + .1, [84, 88, 91, 96], .09, .18);
}
