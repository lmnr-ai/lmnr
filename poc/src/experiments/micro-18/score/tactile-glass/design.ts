import type {ScoreCues} from '../cues';
import {bell, dive, drain, impact, keyClick, marker, pop, puff, thock, tick, whoosh, type Mix, type Route} from '../voices';

/*
 * Foley for the picture: every move, lock and error has a physical sound. It
 * lives on the SFX bus, which never ducks, and it carves the score out of the
 * way through `planDucks` (run before any music is emitted).
 */

const AIR: Route = {bus: 'sfx', gain: .75, room: .18, hall: .08};
const TOUCH: Route = {bus: 'sfx', room: .22};
const GLASS: Route = {bus: 'sfx', hall: .35, delay: .12};
const LOW: Route = {bus: 'sfx', hall: .05};

/** D major pentatonic, low → high: issue pops are pitched by height on screen. */
const PENTATONIC = [74, 76, 78, 81, 83, 86, 88, 90, 93];

export function planDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  mix.duck(u2.failure, .55, .02, .35, .9);
  for (const time of [u2.warning, cost.bashWarning]) mix.duck(time, .5, .03, .45, .8);
  mix.duck(cost.bashStop, .7, .02, .15, .5);
  mix.duck(cost.depletion.at + .4, .75, .6, cost.depletion.duration - 1, .8);
  mix.duck(issues.windowShut, .65, .08, issues.windowUp.at - issues.windowShut - .2, .6);
}

export function designSound(mix: Mix, cues: ScoreCues) {
  ultimate2(mix, cues);
  cost(mix, cues);
  flow(mix, cues);
  issues(mix, cues);
  conclusion(mix, cues);
}

/** The two red warnings share one voice: a glass tritone, a knock under it. */
function errorTone(mix: Mix, time: number) {
  bell(mix, time, 81, .7, {...GLASS, pan: -.1}, {decay: .9, ratio: 3.5, index: 1.4});
  bell(mix, time + .09, 75, .62, {...GLASS, pan: .1}, {decay: 1.1, ratio: 3.5, index: 1.4});
  thock(mix, time, .55, TOUCH, .8);
}

function ultimate2(mix: Mix, cues: ScoreCues) {
  const u2 = cues.ultimate2;
  pop(mix, u2.agentEnter + .01, 81, .6, {...TOUCH, pan: 0});
  for (const [i, time] of [u2.firstThinking.at, u2.firstThinking.at + .1].entries()) puff(mix, time, .35 - i * .1, {...AIR, pan: i ? .2 : -.2}, 1400);

  // The stream takes off: a quick lift, then a soft wind that rides under the blocks.
  whoosh(mix, u2.stream.at - .12, .55, AIR, {from: 400, to: 2600, level: .5, peak: .7, panFrom: -.4, panTo: .1});
  whoosh(mix, u2.stream.at + .3, u2.stream.duration - .3, {...AIR, gain: .5}, {from: 700, to: 1200, level: .3, q: .9, peak: .5, air: .15});

  // Failure: the agent keeps going straight and powers down.
  dive(mix, u2.failure, 1.1, {...LOW, pan: .15}, {fromMidi: 62, toMidi: 38, level: .22});
  whoosh(mix, u2.upwardTurn.at, u2.upwardTurn.duration, AIR, {from: 300, to: 1500, level: .35, peak: .6, panFrom: .2, panTo: -.2});
  whoosh(mix, u2.backtrack.at, u2.backtrack.duration, AIR, {from: 1600, to: 380, level: .45, peak: .45, panFrom: .4, panTo: -.3});

  // Three drawers slide open; each gets a felt slide and a small latch.
  u2.drawers.forEach((time, i) => {
    whoosh(mix, time - .04, .3, {...TOUCH, pan: -.25 + i * .25}, {from: 900, to: 3400, level: .32, q: 1.8, peak: .55, air: .4});
    tick(mix, time + .26, 86 + i * 2, .45, {...TOUCH, pan: -.25 + i * .25}, .01);
  });
  marker(mix, u2.highlight.at, .55, TOUCH, .32);
  errorTone(mix, u2.warning);

  // Zoom out to the cloud of traces: long exhale, a sparkle as the stream collapses.
  whoosh(mix, u2.zoom.at, u2.zoom.duration, AIR, {from: 2400, to: 300, level: .5, peak: .3, q: 1, panFrom: -.2, panTo: .2});
  whoosh(mix, u2.collapse.at, u2.collapse.duration, TOUCH, {from: 5200, to: 1800, level: .25, q: 2.6, peak: .2, air: .6});
  for (let n = 0; n < 7; n++) tick(mix, u2.collapse.at + n * .075, [93, 90, 88, 86, 83, 81, 78][n], .3 - n * .03, {...GLASS, pan: (n % 2 ? .5 : -.5)}, .03);
  whoosh(mix, u2.cloudIn.at, u2.cloudIn.duration, AIR, {from: 180, to: 900, level: .7, peak: .75, q: .9, panFrom: .5, panTo: -.1, tone: 45});
  puff(mix, u2.cloudIn.at + u2.cloudIn.duration - .1, .5, AIR, 600);
}

function cost(mix: Mix, cues: ScoreCues) {
  const c = cues.cost;
  whoosh(mix, c.cloudOut.at, c.cloudOut.duration * .7, AIR, {from: 900, to: 200, level: .65, peak: .25, q: .8, panFrom: -.1, panTo: .6, tone: 50});
  // Cheap agents zip across in three legs; each one panned the way it flies.
  for (const leg of c.cheapLegs) {
    const direction = leg.direction === 'leftToRight' ? 1 : -1;
    whoosh(mix, leg.at - .05, leg.duration + .05, TOUCH, {from: 1200, to: 4600, level: .34, q: 2, peak: .6, air: .5, panFrom: -.7 * direction, panTo: .7 * direction});
  }
  whoosh(mix, c.thinkingDrop.at, c.thinkingDrop.duration, TOUCH, {from: 2600, to: 700, level: .3, peak: .5, q: 1.6});
  thock(mix, c.thinkingDrop.at + c.thinkingDrop.duration - .05, .35, TOUCH, 1.3);

  whoosh(mix, c.cameraToBash.at, c.cameraToBash.duration, AIR, {from: 1700, to: 240, level: .5, peak: .5, panFrom: .1, panTo: -.1});
  // The powerful model lands like something heavy.
  whoosh(mix, c.bashEntry.at, c.bashEntry.duration, AIR, {from: 160, to: 700, level: .45, peak: .85, q: 1.1, tone: 38});
  impact(mix, c.bashStop, .32, LOW);
  thock(mix, c.bashStop, .7, TOUCH, .7);
  whoosh(mix, c.bashExpand, .28, TOUCH, {from: 800, to: 3000, level: .3, q: 1.8, peak: .6, air: .4});
  // Log lines scroll past: fast ticks that slow as the descent eases out.
  const descent = c.bashDescent;
  for (let t = 0; t < descent.duration; ) {
    const progress = t / descent.duration;
    tick(mix, descent.at + t, 100 - progress * 6 + (mix.random() - .5) * 2, .22 * (1 - progress * .5), {...TOUCH, pan: (mix.random() - .5) * .5}, .006);
    t += 1 / (32 - 22 * progress ** 2);
  }
  marker(mix, c.bashHighlight.at, .5, TOUCH, .3);
  errorTone(mix, c.bashWarning);

  whoosh(mix, c.cameraToBudget.at, c.cameraToBudget.duration, AIR, {from: 1500, to: 260, level: .45, peak: .5, panFrom: -.1, panTo: .1});
  puff(mix, c.smokeEnter, .45, AIR, 700);
  // The budget: two coins of light — then the counter drains away.
  bell(mix, c.budgetAppear, 88, .5, {...GLASS, pan: -.15}, {decay: .6, ratio: 3.5, index: 1.2});
  bell(mix, c.budgetAppear + .08, 95, .42, {...GLASS, pan: .15}, {decay: .9, ratio: 3.5, index: 1.2});
  for (let n = 0; n < 6; n++) tick(mix, c.budgetRun.at + n * c.budgetRun.duration / 6, 88 + n, .22, TOUCH, .008);
  const depletion = c.depletion;
  drain(mix, depletion.at, depletion.duration, {...GLASS, hall: .25}, {fromMidi: 81, toMidi: 50, level: .075});
  let at = 0;
  for (let n = 0; at < depletion.duration - .1; n++) {
    const progress = at / depletion.duration;
    tick(mix, depletion.at + at, 91 - 24 * progress ** 1.3, .3 * (1 - progress * .6), {...TOUCH, pan: -.2 + .4 * progress}, .012);
    at += .07 + .3 * progress ** 2;
  }
  puff(mix, depletion.at + depletion.duration * .8, .3, AIR, 450);
}

function flow(mix: Mix, cues: ScoreCues) {
  const f = cues.flow;
  whoosh(mix, f.entry.at, f.reveal - f.entry.at + .05, AIR, {from: 220, to: 2600, level: .5, peak: .92, q: 1, panFrom: 0, panTo: 0});
  impact(mix, f.reveal, .4, LOW);
  whoosh(mix, f.reveal, 1.8, AIR, {from: 5000, to: 1400, level: .3, peak: .05, q: 1.1, air: .6});
  // Glints across the Flow-1 title.
  for (let n = 0; n < 10; n++) {
    const time = f.reveal + .08 + n * .11 + mix.random() * .04;
    bell(mix, time, [93, 90, 88, 86, 93, 90, 88, 86, 85, 81][n], .28 - n * .018, {...GLASS, pan: (mix.random() - .5) * 1.4}, {decay: .5, ratio: 2, index: .5});
  }

  whoosh(mix, f.cloudExit.at, f.cloudExit.duration, AIR, {from: 500, to: 2200, level: .45, peak: .45, panFrom: -.5, panTo: .6});
  whoosh(mix, f.cameraZoom.at, f.cameraZoom.duration, AIR, {from: 300, to: 1800, level: .35, peak: .7});
  // Benchmark rows drop in, top to bottom — Flow-1's row rings the loudest.
  const drops = [93, 90, 88, 86, 83, 81];
  f.numberDrops.forEach((time, n) => {
    bell(mix, time, drops[n], n === 2 ? .6 : .38, {...GLASS, pan: -.3 + n * .12}, {decay: .5, ratio: 3.5, index: 1});
    thock(mix, time, .2, TOUCH, 2.4);
  });
  for (let n = 0; n < 10; n++) tick(mix, f.countUp.at + f.countUp.duration * (n / 10) ** .7, 84 + n, .2, {...TOUCH, pan: .15}, .006);

  whoosh(mix, f.cameraToAnalysis.at, f.cameraToAnalysis.duration, AIR, {from: 600, to: 3000, level: .4, peak: .5, panFrom: .5, panTo: -.3});
  for (let n = 0; n < 4; n++) tick(mix, f.numberSwap.at + n * f.numberSwap.duration / 4, [90, 86, 90, 93][n], .3, {...TOUCH, pan: -.1}, .01);
  // Bars grow like a ratchet climbing to the top.
  const bars = f.barsGrow;
  for (let n = 0; n < 16; n++) {
    const progress = n / 16;
    tick(mix, bars.at + bars.duration * (1 - (1 - progress) ** 1.6), 76 + n * 1.2, .22 + progress * .12, {...TOUCH, pan: -.4 + progress * .8}, .009);
  }
  bell(mix, bars.at + bars.duration, 93, .5, {...GLASS, pan: .2}, {decay: 1.2, ratio: 2, index: .8});
  bell(mix, bars.at + bars.duration + .03, 86, .45, {...GLASS, pan: -.2}, {decay: 1.2, ratio: 2, index: .8});
  for (let n = 0; n < 8; n++) tick(mix, f.analysisCountUp.at + f.analysisCountUp.duration * (n / 8) ** .6, 86 + n * .7, .14, TOUCH, .006);

  whoosh(mix, f.cameraToEngine.at, f.cameraToEngine.duration, AIR, {from: 500, to: 2600, level: .4, peak: .5, panFrom: -.4, panTo: .4});
  bell(mix, f.moduleActivation, 90, .5, {...GLASS, pan: 0}, {decay: .8, ratio: 3.5, index: 1.1});
  pop(mix, f.moduleActivation, 86, .5, TOUCH);
  for (let n = 0; n < 8; n++) tick(mix, f.engineSpinner.at + n * f.engineSpinner.duration / 8, 93 - (n % 2) * 3, .12, {...TOUCH, pan: n % 2 ? .3 : -.3}, .006);
  // Split door: two halves converge and shut.
  whoosh(mix, f.cover.at, f.cover.duration, TOUCH, {from: 500, to: 2200, level: .38, peak: .85, panFrom: -.8, panTo: -.1});
  whoosh(mix, f.cover.at, f.cover.duration, TOUCH, {from: 520, to: 2300, level: .38, peak: .85, panFrom: .8, panTo: .1});
  thock(mix, f.coverShut, .85, TOUCH);
  impact(mix, f.coverShut, .18, LOW);
}

function issues(mix: Mix, cues: ScoreCues) {
  const i = cues.issues;
  // Issues bubble up across the field: each pop pitched by height, panned by position.
  for (const item of i.pops) {
    const midi = PENTATONIC[Math.min(PENTATONIC.length - 1, Math.floor(item.height * PENTATONIC.length))];
    pop(mix, item.at, midi + (mix.random() - .5) * .15, .34 + mix.random() * .12, {...TOUCH, pan: item.pan * .9, delay: .06});
  }
  // They swarm to their clusters…
  for (let n = 0; n < 6; n++) {
    const pan = n % 2 ? .6 : -.6;
    whoosh(mix, i.travel.at + n * .08, i.travel.duration * .55, {...AIR, gain: .6}, {from: 700 + n * 150, to: 2400 + n * 300, level: .26, peak: .5, q: 1.6, panFrom: pan, panTo: -pan * .3, air: .4});
  }
  // …and lock in, one bell per cluster, spelling D major 9.
  [74, 78, 81, 85, 88, 93].forEach((midi, n) => {
    const time = i.clusters[Math.min(n, i.clusters.length - 1)] + n * .045;
    bell(mix, time, midi, .42, {...GLASS, pan: -.5 + n * .2}, {decay: 1.1, ratio: 2, index: .7});
    tick(mix, time, midi + 12, .2, {...TOUCH, pan: -.5 + n * .2}, .006);
  });

  // The agent window drops in, typing, a send, and back out.
  whoosh(mix, i.windowDown.at, i.windowDown.duration, AIR, {from: 1800, to: 360, level: .45, peak: .6, panFrom: 0, panTo: 0});
  thock(mix, i.windowShut, .7, TOUCH);
  for (const window of i.typing) {
    for (let t = 0; t < window.duration; ) {
      keyClick(mix, window.at + t, .45 + mix.random() * .25, {...TOUCH, pan: (mix.random() - .5) * .3});
      t += (1 / 22) * (.7 + mix.random() * .6);
    }
  }
  for (const time of [i.issueBadge, i.queryBadge]) pop(mix, time, 88, .5, {...TOUCH, pan: .2});
  whoosh(mix, i.messageSend - .04, .32, TOUCH, {from: 900, to: 4400, level: .38, q: 1.8, peak: .7, panFrom: -.2, panTo: .4, air: .5});
  bell(mix, i.messageSend + .22, 86, .38, {...GLASS, pan: .3}, {decay: .7, ratio: 3.5, index: 1});
  whoosh(mix, i.windowUp.at, i.windowUp.duration, AIR, {from: 400, to: 2000, level: .42, peak: .5});
}

function conclusion(mix: Mix, cues: ScoreCues) {
  const logo = cues.conclusion.logo;
  whoosh(mix, logo - 1.2, 1.25, AIR, {from: 200, to: 3200, level: .45, peak: .96, q: 1, air: .5});
  impact(mix, logo, .42, LOW);
  whoosh(mix, logo, 2.2, AIR, {from: 4800, to: 1100, level: .24, peak: .04, q: 1, air: .6});
  tick(mix, logo, 98, .3, GLASS, .03);
}
