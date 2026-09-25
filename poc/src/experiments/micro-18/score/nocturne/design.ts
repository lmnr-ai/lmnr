import type {ScoreCues} from '../cues';
import {clamp} from '../dsp';
import {beep, drain, impact, keyClick, piano, pizz, puff, thock, tick, whoosh, type Mix, type Route} from '../voices';

/*
 * Nocturne foley is deliberately quiet: moves are breath, not swooshes, and the machine speaks
 * only in clean sine beeps — a telemetry layer over the piano, never a cartoon. Errors are a
 * soft two-tone alert, not a bell.
 */

const AIR: Route = {bus: 'sfx', gain: .55, room: .12, hall: .12};
const TOUCH: Route = {bus: 'sfx', gain: .8, room: .2};
const TECH: Route = {bus: 'sfx', gain: .85, hall: .2, delay: .18};
const LOW: Route = {bus: 'sfx', hall: .08};

export function planNocturneDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.warning, cost.bashWarning]) mix.duck(time, .7, .03, .35, .7);
  mix.duck(issues.windowShut, .75, .08, issues.windowUp.at - issues.windowShut - .2, .6);
}

type PingOptions = {length?: number; wave?: 'sine' | 'square' | 'triangle'; attack?: number; glide?: number};
/** The machine's voice: every beep, tick and the budget drain go through here. */
type Telemetry = {
  ping(mix: Mix, time: number, midi: number, velocity: number, route: Route, options?: PingOptions): void;
  tick(mix: Mix, time: number, midi: number, velocity: number, route: Route, decay?: number): void;
  depletion(mix: Mix, at: number, duration: number, key: number): void;
  /** Issue pops the composition already plays, so the foley leaves them alone. */
  popTaken?(index: number): boolean;
};

const electronic = (): Telemetry => ({
  ping: beep, tick,
  depletion(mix, at, duration, key) {
    // The counter falls: beeps descend and slow, and a faint tone drains beneath them.
    drain(mix, at, duration, {...TECH, delay: 0}, {fromMidi: 79, toMidi: 55, level: .04});
    for (let t = 0; t < duration - .1; ) {
      const progress = t / duration;
      beep(mix, at + t, key + Math.round(91 - 22 * progress ** 1.3), .11 * (1 - progress * .5), {...TECH, pan: -.2 + .4 * progress}, {length: .03});
      t += .08 + .3 * progress ** 2;
    }
  },
});

// Nocturne's pitches relative to E♭; the scale degrees of a major key, in semitones.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/**
 * The score's own instrument answers for the machine: notes snapped into the key, folded into the
 * instrument's range, glides as two notes, and anything closer than 48 ms to a previous note dropped.
 * Square-wave pings are the deliberate wrong notes, so they keep their pitch.
 */
const played = (instrument: 'piano' | 'pizz', key: number, popTaken: (index: number) => boolean) => (): Telemetry => {
  const taken: number[] = [];
  const play = (mix: Mix, time: number, midi: number, velocity: number, route: Route, length: number, snap = true) => {
    if (taken.some(other => Math.abs(other - time) < .048)) return;
    taken.push(time);
    let note = !snap || MAJOR.includes(((midi - 3 - key) % 12 + 12) % 12) ? midi : midi - 1;
    while (note > 96) note -= 12;
    while (note < 55) note += 12;
    // A note rings far longer than a 30 ms beep, so it plays ~4 dB under the beep's level.
    const v = clamp(.12 + velocity * .9, 0, .45), quiet = {...route, gain: (route.gain ?? 1) * .6};
    if (instrument === 'piano') piano(mix, time, note, v, quiet, {length: Math.max(.8, length * 8), bright: .5});
    else pizz(mix, time, note, v, quiet, {length: .9});
  };
  return {
    ping(mix, time, midi, velocity, route, options = {}) {
      play(mix, time, midi, velocity, route, options.length ?? .07, options.wave !== 'square');
      if (options.glide) play(mix, time + .2, midi + options.glide, velocity * .8, route, options.length ?? .07);
    },
    tick: (mix, time, midi, velocity, route) => play(mix, time, midi, velocity * .7, route, .06),
    // The composition plays the drain as its own falling line.
    depletion: () => {},
    popTaken,
  };
};

/** Nocturne's foley pitched `key` semitones from E♭, so its telemetry sits inside another score's key. */
export const designInKey = (key: number, voice: () => Telemetry = electronic) => (mix: Mix, cues: ScoreCues) => {
  const t = voice();
  ultimate2(mix, cues, key, t);
  cost(mix, cues, key, t);
  flow(mix, cues, key, t);
  issues(mix, cues, key, t);
  conclusion(mix, cues, key, t);
};
export const designNocturne = designInKey(0);
/** The same foley with no electronics: the machine speaks through `instrument`, in the score's key. */
export const designAcoustic = (key: number, instrument: 'piano' | 'pizz', popTaken: (index: number) => boolean) => designInKey(key, played(instrument, key, popTaken));

/** A soft system alert: falling minor third in square-ish sine, doubled a fifth below. */
function alert(mix: Mix, time: number, key: number, t: Telemetry) {
  t.ping(mix, time, key + 88, .5, {...TECH, pan: -.08}, {length: .09, wave: 'triangle'});
  t.ping(mix, time + .13, key + 85, .46, {...TECH, pan: .08}, {length: .16, wave: 'triangle'});
  t.ping(mix, time, key + 76, .2, TECH, {length: .3});
  thock(mix, time, .3, TOUCH, .8);
}

function ultimate2(mix: Mix, cues: ScoreCues, key: number, t: Telemetry) {
  const u2 = cues.ultimate2;
  t.ping(mix, u2.agentEnter + .01, key + 87, .26, {...TECH, pan: 0}, {length: .05});
  t.ping(mix, u2.agentEnter + .09, key + 94, .18, {...TECH, pan: .1}, {length: .05});
  puff(mix, u2.firstThinking.at, .18, {...AIR, pan: -.15}, 1400);
  whoosh(mix, u2.stream.at - .12, .55, AIR, {from: 400, to: 2200, level: .28, peak: .7, panFrom: -.3, panTo: .1});

  // The run powers down: a sine that sags an octave.
  t.ping(mix, u2.failure, key + 75, .32, {...TECH, pan: .15}, {length: .9, glide: -12, attack: .004});
  whoosh(mix, u2.upwardTurn.at, u2.upwardTurn.duration, AIR, {from: 300, to: 1300, level: .2, peak: .6, panFrom: .2, panTo: -.2});
  whoosh(mix, u2.backtrack.at, u2.backtrack.duration, AIR, {from: 1500, to: 380, level: .26, peak: .45, panFrom: .4, panTo: -.3});
  u2.drawers.forEach((time, i) => {
    whoosh(mix, time - .04, .28, {...TOUCH, pan: -.25 + i * .25}, {from: 900, to: 2800, level: .16, q: 1.8, peak: .55, air: .3});
    t.tick(mix, time + .24, key + (84 + i * 3), .22, {...TOUCH, pan: -.25 + i * .25}, .008);
  });
  t.ping(mix, u2.highlight.at, key + 91, .16, {...TECH, pan: .2}, {length: .04});
  alert(mix, u2.warning, key, t);

  whoosh(mix, u2.zoom.at, u2.zoom.duration, AIR, {from: 2200, to: 300, level: .3, peak: .3, q: 1, panFrom: -.2, panTo: .2});
  // The stream collapses into data: a scatter of tiny beeps.
  for (let n = 0; n < 9; n++) t.ping(mix, u2.collapse.at + n * .06 + mix.random() * .02, key + [99, 96, 94, 91, 89, 87, 84, 82, 79][n], .12 - n * .008, {...TECH, pan: n % 2 ? .45 : -.45}, {length: .025});
  whoosh(mix, u2.cloudIn.at, u2.cloudIn.duration, AIR, {from: 180, to: 800, level: .36, peak: .75, q: .9, panFrom: .4, panTo: -.1});
}

function cost(mix: Mix, cues: ScoreCues, key: number, t: Telemetry) {
  const c = cues.cost;
  whoosh(mix, c.cloudOut.at, c.cloudOut.duration * .7, AIR, {from: 900, to: 220, level: .34, peak: .25, q: .8, panFrom: -.1, panTo: .5});
  for (const leg of c.cheapLegs) {
    const direction = leg.direction === 'leftToRight' ? 1 : -1;
    whoosh(mix, leg.at - .05, leg.duration + .05, TOUCH, {from: 1400, to: 4400, level: .16, q: 2, peak: .6, air: .4, panFrom: -.6 * direction, panTo: .6 * direction});
    t.ping(mix, leg.at + leg.duration * .8, key + 96, .1, {...TECH, pan: .5 * direction}, {length: .03});
  }
  thock(mix, c.thinkingDrop.at + c.thinkingDrop.duration - .05, .22, TOUCH, 1.3);
  // "…fail to find crucial issues": a flat negative blip.
  t.ping(mix, c.missIssues, key + 64, .2, {...TECH, pan: 0}, {length: .18, wave: 'square'});

  whoosh(mix, c.cameraToBash.at, c.cameraToBash.duration, AIR, {from: 1500, to: 240, level: .28, peak: .5, panFrom: .1, panTo: -.1});
  whoosh(mix, c.bashEntry.at, c.bashEntry.duration, AIR, {from: 160, to: 600, level: .26, peak: .85, q: 1.1});
  impact(mix, c.bashStop, .22, LOW);
  thock(mix, c.bashStop, .45, TOUCH, .7);
  // Log lines scroll past as a quiet teletype of beeps.
  const descent = c.bashDescent;
  for (let at = 0; at < descent.duration; ) {
    const progress = at / descent.duration;
    t.ping(mix, descent.at + at, key + (96 - Math.round(progress * 5) + (mix.random() > .7 ? 5 : 0)), .07 * (1 - progress * .4), {...TECH, pan: (mix.random() - .5) * .6}, {length: .018});
    at += 1 / (22 - 14 * progress ** 2);
  }
  alert(mix, c.bashWarning, key, t);

  whoosh(mix, c.cameraToBudget.at, c.cameraToBudget.duration, AIR, {from: 1400, to: 260, level: .26, peak: .5, panFrom: -.1, panTo: .1});
  t.ping(mix, c.budgetAppear, key + 87, .2, {...TECH, pan: -.1}, {length: .06});
  t.ping(mix, c.budgetAppear + .08, key + 94, .16, {...TECH, pan: .1}, {length: .09});
  t.depletion(mix, c.depletion.at, c.depletion.duration, key);
}

function flow(mix: Mix, cues: ScoreCues, key: number, t: Telemetry) {
  const f = cues.flow;
  whoosh(mix, f.entry.at, f.reveal - f.entry.at + .05, AIR, {from: 220, to: 2200, level: .3, peak: .92, q: 1});
  impact(mix, f.reveal, .2, LOW);
  whoosh(mix, f.reveal, 1.6, AIR, {from: 4200, to: 1400, level: .14, peak: .05, q: 1.1, air: .5});

  whoosh(mix, f.cloudExit.at, f.cloudExit.duration, AIR, {from: 500, to: 2000, level: .24, peak: .45, panFrom: -.5, panTo: .6});
  whoosh(mix, f.cameraZoom.at, f.cameraZoom.duration, AIR, {from: 300, to: 1600, level: .2, peak: .7});
  // Benchmark rows land as readouts; Flow-1's row is the brightest.
  f.numberDrops.forEach((time, n) => t.ping(mix, time, key + ([91, 87, 94, 84, 82, 79][n] ?? 79), n === 2 ? .26 : .14, {...TECH, pan: -.3 + n * .12}, {length: n === 2 ? .12 : .04}));
  for (let n = 0; n < 10; n++) t.ping(mix, f.countUp.at + f.countUp.duration * (n / 10) ** .7, key + (82 + n), .07, {...TECH, pan: .15}, {length: .018});

  whoosh(mix, f.cameraToAnalysis.at, f.cameraToAnalysis.duration, AIR, {from: 600, to: 2600, level: .24, peak: .5, panFrom: .5, panTo: -.3});
  for (let n = 0; n < 4; n++) t.ping(mix, f.numberSwap.at + n * f.numberSwap.duration / 4, key + [87, 84, 87, 91][n], .12, {...TECH, pan: -.1}, {length: .03});
  for (let n = 0; n < 8; n++) t.ping(mix, f.analysisCountUp.at + f.analysisCountUp.duration * (n / 8) ** .6, key + (87 + n), .06, TECH, {length: .016});

  whoosh(mix, f.cameraToEngine.at, f.cameraToEngine.duration, AIR, {from: 500, to: 2200, level: .24, peak: .5, panFrom: -.4, panTo: .4});
  // Signals boots: a clean power-on chirp, then the spinner's soft alternating pings.
  t.ping(mix, f.moduleActivation, key + 82, .22, {...TECH, pan: 0}, {length: .14, glide: 12});
  t.ping(mix, f.moduleActivation + .15, key + 94, .18, TECH, {length: .08});
  for (let n = 0; n < 8; n++) t.ping(mix, f.engineSpinner.at + n * f.engineSpinner.duration / 8, key + (n % 2 ? 91 : 94), .06, {...TECH, pan: n % 2 ? .3 : -.3}, {length: .02});
  whoosh(mix, f.cover.at, f.cover.duration, TOUCH, {from: 500, to: 1800, level: .18, peak: .85, panFrom: -.7, panTo: -.1});
  whoosh(mix, f.cover.at, f.cover.duration, TOUCH, {from: 520, to: 1900, level: .18, peak: .85, panFrom: .7, panTo: .1});
  thock(mix, f.coverShut, .55, TOUCH);
}

function issues(mix: Mix, cues: ScoreCues, key: number, t: Telemetry) {
  const i = cues.issues;
  // Every issue found: a short sine ping, pitched by height; the piano takes every third one.
  const scale = [75, 77, 79, 82, 84, 87, 89, 91, 94];
  i.pops.forEach((item, index) => {
    if (t.popTaken?.(index)) return;
    const midi = scale[Math.min(scale.length - 1, Math.floor(item.height * scale.length))] + 12;
    t.ping(mix, item.at, key + midi, .09 + mix.random() * .04, {...TECH, pan: item.pan * .9}, {length: .03});
  });
  for (let n = 0; n < 4; n++) {
    const pan = n % 2 ? .5 : -.5;
    whoosh(mix, i.travel.at + n * .1, i.travel.duration * .55, {...AIR, gain: .45}, {from: 700 + n * 150, to: 2000 + n * 300, level: .2, peak: .5, q: 1.6, panFrom: pan, panTo: -pan * .3, air: .3});
  }
  i.clusters.forEach((time, n) => t.ping(mix, time, key + [87, 91, 94, 99, 94, 91][n % 6], .12, {...TECH, pan: -.5 + (n % 6) * .2}, {length: .05}));

  whoosh(mix, i.windowDown.at, i.windowDown.duration, AIR, {from: 1600, to: 360, level: .26, peak: .6});
  thock(mix, i.windowShut, .45, TOUCH);
  for (const window of i.typing) {
    for (let at = 0; at < window.duration; ) {
      keyClick(mix, window.at + at, .3 + mix.random() * .15, {...TOUCH, pan: (mix.random() - .5) * .3});
      at += (1 / 22) * (.7 + mix.random() * .6);
    }
  }
  for (const time of [i.issueBadge, i.queryBadge]) t.ping(mix, time, key + 87, .18, {...TECH, pan: .2}, {length: .06});
  whoosh(mix, i.messageSend - .04, .3, TOUCH, {from: 900, to: 3800, level: .18, q: 1.8, peak: .7, panFrom: -.2, panTo: .4, air: .4});
  t.ping(mix, i.messageSend + .2, key + 91, .16, {...TECH, pan: .3}, {length: .05});
  t.ping(mix, i.messageSend + .28, key + 96, .13, {...TECH, pan: .35}, {length: .07});
  whoosh(mix, i.windowUp.at, i.windowUp.duration, AIR, {from: 400, to: 1800, level: .24, peak: .5});
}

function conclusion(mix: Mix, cues: ScoreCues, key: number, t: Telemetry) {
  const logo = cues.conclusion.logo;
  whoosh(mix, logo - 1.2, 1.25, AIR, {from: 200, to: 2600, level: .24, peak: .96, q: 1, air: .4});
  impact(mix, logo, .18, LOW);
  // The signature: E♭–B♭–E♭ in pure sine, the machine signing off under the piano.
  [[.5, 87], [.62, 94], [.74, 99]].forEach(([delay, midi], n) => t.ping(mix, logo + delay, key + midi, .12 - n * .02, {...TECH, pan: -.15 + n * .15}, {length: .08}));
}
