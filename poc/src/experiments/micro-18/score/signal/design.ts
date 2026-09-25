import type {ScoreCues} from '../cues';
import {bell, beep, drain, impact, keyClick, thock, whoosh, type Mix, type Route} from '../voices';

/*
 * Signal foley is the machine's own voice: FM blips, sample-and-hold data chatter and square-wave
 * alerts, all quantised to the score's key (A major) so the picture plays in tune with the music.
 */

const AIR: Route = {bus: 'sfx', gain: .55, room: .12, hall: .1};
const TOUCH: Route = {bus: 'sfx', gain: .8, room: .2};
const BLIP: Route = {bus: 'sfx', gain: .85, hall: .15, delay: .22};
const LOW: Route = {bus: 'sfx', hall: .06};

const PENTATONIC = [81, 83, 85, 88, 90, 93, 95, 97, 100];

export function planSignalDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.warning, cost.bashWarning]) mix.duck(time, .65, .03, .35, .7);
  mix.duck(issues.windowShut, .7, .08, issues.windowUp.at - issues.windowShut - .2, .6);
}

export function designSignal(mix: Mix, cues: ScoreCues) {
  ultimate2(mix, cues);
  cost(mix, cues);
  flow(mix, cues);
  issues(mix, cues);
  conclusion(mix, cues);
}

const blip = (mix: Mix, time: number, midi: number, velocity: number, pan = 0) =>
  bell(mix, time, midi, velocity, {...BLIP, pan}, {decay: .22, ratio: 1.5, index: 2.2});

/** Sample-and-hold chatter: random in-key 30 ms beeps across a window. */
function chatter(mix: Mix, from: number, duration: number, rate: number, velocity: number, notes = PENTATONIC) {
  for (let t = 0; t < duration; t += 1 / rate) {
    if (mix.random() > .55) continue;
    beep(mix, from + t, notes[Math.floor(mix.random() * notes.length)], velocity * (.7 + mix.random() * .3), {...BLIP, pan: (mix.random() - .5) * 1.2}, {length: .025});
  }
}

/** Error: a triple square-wave pulse on a flat seventh, the machine's own alarm. */
function alert(mix: Mix, time: number) {
  for (let n = 0; n < 3; n++) beep(mix, time + n * .085, n === 2 ? 79 : 84, .34, {...BLIP, pan: (n - 1) * .15}, {length: .055, wave: 'square'});
  thock(mix, time, .3, TOUCH, .8);
}

function ultimate2(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2;
  blip(mix, u2.agentEnter + .01, 93, .4);
  whoosh(mix, u2.stream.at - .12, .5, AIR, {from: 400, to: 2400, level: .26, peak: .7, panFrom: -.3, panTo: .1});
  chatter(mix, u2.stream.at, u2.failure - u2.stream.at, 16, .09);

  beep(mix, u2.failure + .1, 69, .3, {...BLIP, pan: .15}, {length: .7, glide: -19, wave: 'triangle'});
  whoosh(mix, u2.upwardTurn.at, u2.upwardTurn.duration, AIR, {from: 300, to: 1300, level: .2, peak: .6, panFrom: .2, panTo: -.2});
  whoosh(mix, u2.backtrack.at, u2.backtrack.duration, AIR, {from: 1500, to: 380, level: .26, peak: .45, panFrom: .4, panTo: -.3});
  u2.drawers.forEach((time, i) => {
    whoosh(mix, time - .04, .26, {...TOUCH, pan: -.25 + i * .25}, {from: 900, to: 2800, level: .16, q: 1.8, peak: .55, air: .3});
    blip(mix, time + .22, [85, 88, 93][i], .26, -.25 + i * .25);
  });
  alert(mix, u2.warning);
  whoosh(mix, u2.zoom.at, u2.zoom.duration, AIR, {from: 2200, to: 300, level: .3, peak: .3, q: 1});
  chatter(mix, u2.collapse.at, .6, 24, .1);
  whoosh(mix, u2.cloudIn.at, u2.cloudIn.duration, AIR, {from: 180, to: 800, level: .34, peak: .75, q: .9, panFrom: .4, panTo: -.1});
}

function cost(mix: Mix, cues: ScoreCues) {
  const c = cues.cost;
  whoosh(mix, c.cloudOut.at, c.cloudOut.duration * .7, AIR, {from: 900, to: 220, level: .32, peak: .25, q: .8, panFrom: -.1, panTo: .5});
  for (const leg of c.cheapLegs) {
    const direction = leg.direction === 'leftToRight' ? 1 : -1;
    whoosh(mix, leg.at - .05, leg.duration + .05, TOUCH, {from: 1400, to: 4400, level: .16, q: 2, peak: .6, air: .4, panFrom: -.6 * direction, panTo: .6 * direction});
  }
  thock(mix, c.thinkingDrop.at + c.thinkingDrop.duration - .05, .24, TOUCH, 1.3);

  whoosh(mix, c.cameraToBash.at, c.cameraToBash.duration, AIR, {from: 1500, to: 240, level: .28, peak: .5});
  whoosh(mix, c.bashEntry.at, c.bashEntry.duration, AIR, {from: 160, to: 600, level: .28, peak: .85, q: 1.1, tone: 33});
  impact(mix, c.bashStop, .3, LOW);
  thock(mix, c.bashStop, .5, TOUCH, .7);
  chatter(mix, c.bashDescent.at, c.bashDescent.duration, 20, .08, [81, 83, 85, 88]);
  alert(mix, c.bashWarning);

  whoosh(mix, c.cameraToBudget.at, c.cameraToBudget.duration, AIR, {from: 1400, to: 260, level: .26, peak: .5});
  blip(mix, c.budgetAppear, 88, .32, -.1);
  blip(mix, c.budgetAppear + .08, 93, .28, .1);
  drain(mix, c.depletion.at, c.depletion.duration, {...BLIP, delay: 0}, {fromMidi: 81, toMidi: 45, level: .045});
  for (let at = 0; at < c.depletion.duration - .1; ) {
    const progress = at / c.depletion.duration;
    beep(mix, c.depletion.at + at, Math.round(93 - 24 * progress ** 1.3), .1 * (1 - progress * .5), {...BLIP, pan: -.2 + .4 * progress}, {length: .03, wave: 'triangle'});
    at += .08 + .3 * progress ** 2;
  }
}

function flow(mix: Mix, cues: ScoreCues) {
  const f = cues.flow;
  whoosh(mix, f.entry.at, f.reveal - f.entry.at + .05, AIR, {from: 220, to: 2400, level: .3, peak: .92, q: 1});
  impact(mix, f.reveal, .22, LOW);
  whoosh(mix, f.cloudExit.at, f.cloudExit.duration, AIR, {from: 500, to: 2000, level: .22, peak: .45, panFrom: -.5, panTo: .6});
  whoosh(mix, f.cameraZoom.at, f.cameraZoom.duration, AIR, {from: 300, to: 1600, level: .2, peak: .7});
  f.numberDrops.forEach((time, n) => blip(mix, time, [93, 88, 97, 85, 83, 81][n] ?? 81, n === 2 ? .42 : .22, -.3 + n * .12));
  chatter(mix, f.countUp.at, f.countUp.duration, 24, .07);
  whoosh(mix, f.cameraToAnalysis.at, f.cameraToAnalysis.duration, AIR, {from: 600, to: 2600, level: .22, peak: .5, panFrom: .5, panTo: -.3});
  for (let n = 0; n < 4; n++) beep(mix, f.numberSwap.at + n * f.numberSwap.duration / 4, [88, 85, 88, 93][n], .12, {...BLIP, pan: -.1}, {length: .03, wave: 'triangle'});
  chatter(mix, f.analysisCountUp.at, f.analysisCountUp.duration, 24, .06);
  whoosh(mix, f.cameraToEngine.at, f.cameraToEngine.duration, AIR, {from: 500, to: 2200, level: .22, peak: .5, panFrom: -.4, panTo: .4});
  beep(mix, f.moduleActivation, 81, .22, BLIP, {length: .14, glide: 12, wave: 'triangle'});
  blip(mix, f.moduleActivation + .15, 93, .3);
  for (let n = 0; n < 8; n++) beep(mix, f.engineSpinner.at + n * f.engineSpinner.duration / 8, n % 2 ? 88 : 93, .06, {...BLIP, pan: n % 2 ? .3 : -.3}, {length: .02});
  whoosh(mix, f.cover.at, f.cover.duration, TOUCH, {from: 500, to: 1800, level: .18, peak: .85, panFrom: -.7, panTo: -.1});
  whoosh(mix, f.cover.at, f.cover.duration, TOUCH, {from: 520, to: 1900, level: .18, peak: .85, panFrom: .7, panTo: .1});
  thock(mix, f.coverShut, .6, TOUCH);
  impact(mix, f.coverShut, .16, LOW);
}

function issues(mix: Mix, cues: ScoreCues) {
  const i = cues.issues;
  // Each issue found is an FM blip, pitched by height and panned by position.
  for (const item of i.pops) blip(mix, item.at, PENTATONIC[Math.min(PENTATONIC.length - 1, Math.floor(item.height * PENTATONIC.length))], .2 + mix.random() * .08, item.pan * .9);
  for (let n = 0; n < 4; n++) {
    const pan = n % 2 ? .5 : -.5;
    whoosh(mix, i.travel.at + n * .1, i.travel.duration * .55, {...AIR, gain: .45}, {from: 700 + n * 150, to: 2000 + n * 300, level: .2, peak: .5, q: 1.6, panFrom: pan, panTo: -pan * .3, air: .3});
  }
  i.clusters.forEach((time, n) => blip(mix, time, [81, 85, 88, 93, 97, 100][n % 6], .26, -.5 + (n % 6) * .2));

  whoosh(mix, i.windowDown.at, i.windowDown.duration, AIR, {from: 1600, to: 360, level: .26, peak: .6});
  thock(mix, i.windowShut, .45, TOUCH);
  for (const window of i.typing) {
    for (let t = 0; t < window.duration; ) {
      keyClick(mix, window.at + t, .3 + mix.random() * .15, {...TOUCH, pan: (mix.random() - .5) * .3});
      t += (1 / 22) * (.7 + mix.random() * .6);
    }
  }
  for (const time of [i.issueBadge, i.queryBadge]) blip(mix, time, 88, .3, .2);
  whoosh(mix, i.messageSend - .04, .3, TOUCH, {from: 900, to: 3800, level: .18, q: 1.8, peak: .7, panFrom: -.2, panTo: .4, air: .4});
  blip(mix, i.messageSend + .2, 93, .28, .3);
  whoosh(mix, i.windowUp.at, i.windowUp.duration, AIR, {from: 400, to: 1800, level: .24, peak: .5});
}

function conclusion(mix: Mix, cues: ScoreCues) {
  const logo = cues.conclusion.logo;
  impact(mix, logo, .2, LOW);
  whoosh(mix, logo, 2, AIR, {from: 4200, to: 1100, level: .16, peak: .04, q: 1, air: .5});
  blip(mix, logo + .5, 93, .22, -.1);
  blip(mix, logo + .62, 100, .18, .1);
}
