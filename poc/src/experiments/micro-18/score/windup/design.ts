import type {ScoreCues} from '../cues';
import {MUSIC_BOX, WOOD, boing, chordAt, glide, modal, radialPops, string, toneOf} from '../rounded';
import {bell, thock, tick, type Mix, type Route} from '../voices';
import {windupPlan} from './composition';

/*
 * Windup foley: every motion turns a gear. Camera moves are soft air over a ratchet whose clicks
 * speed up and slow down with the move; arrivals are springs; closes are wooden clunks. Tier 1
 * warnings are a sagging spring over a low clunk; the smallest things are clock ticks and
 * music-box plinks in the chord.
 */

const FX: Route = {bus: 'sfx', room: .25, hall: .1};
const WET: Route = {bus: 'sfx', room: .25, hall: .3, delay: .1};
const DRY: Route = {bus: 'sfx', room: .12};

export function windupDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.failure, u2.warning, cost.bashWarning, issues.issueBadge]) mix.duck(time, .55, .02, .3, .6);
  mix.duck(cost.thinkingDrop.at, .65, .02, .45, .5);
}

export function designWindup(mix: Mix, cues: ScoreCues) {
  const plan = windupPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const plink = (time: number, index: number, floor: number, velocity: number, pan = 0) =>
    modal(mix, time, tone(time, index, floor), velocity, {...WET, pan}, MUSIC_BOX, {mallet: 5200, malletLevel: .2, name: 'plink'});
  const click = (time: number, midi: number, velocity: number, pan = 0) => tick(mix, time, midi, velocity, {...DRY, pan}, .008);
  const clunk = (time: number, velocity: number, pitch = 1, pan = 0) => { thock(mix, time, velocity, {...DRY, pan}, pitch); modal(mix, time, 60 * pitch, velocity * .5, {...DRY, pan}, WOOD, {mallet: 1400, malletLevel: .7, name: 'clunk'}); };
  const spring = (time: number, midi: number, velocity: number, pan = 0, length = .35, drop = 4) => boing(mix, time, midi, velocity, {...FX, pan}, {length, drop});
  /** A ratchet under a move: `count` clicks eased in and out across the span. */
  const ratchet = (at: number, duration: number, count: number, midi: number, level: number, pan: [number, number] = [0, 0]) => {
    for (let i = 0; i < count; i++) {
      const p = (i + .5) / count, eased = p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      click(at + eased * duration, midi + (i % 2 ? 0 : 3), level * (.6 + .4 * Math.sin(p * Math.PI)), pan[0] + (pan[1] - pan[0]) * p);
    }
  };
  const move = (span: {at: number; duration: number}, up: boolean, level: number, pan: [number, number] = [0, 0]) => {
    const duration = Math.max(.3, span.duration);
    glide(mix, span.at, duration, FX, {from: up ? 500 : 2000, to: up ? 2000 : 500, level: level * .8, panFrom: pan[0], panTo: pan[1]});
    ratchet(span.at, duration, Math.max(4, Math.round(duration * 9)), up ? 88 : 84, level * .55, pan);
  };
  const warning = (time: number, level = 1, pan = 0) => {
    clunk(time, .7 * level, .8, pan);
    spring(time + .02, tone(time, 2, 67), .6 * level, pan, .55, -7);
    plink(time + .05, 1, 74, .35 * level, pan);
  };
  /** Winding the key: clicks that speed up and climb. */
  const windUp = (end: number, duration: number, level: number) => {
    let t = end - duration, gap = .16, i = 0;
    while (t < end - .02) { click(t, 76 + Math.min(14, i * .7), level * (.4 + .6 * (t - end + duration) / duration), i % 2 ? .15 : -.15); t += gap; gap = Math.max(.035, gap * .88); i++; }
  };

  // Ultimate2: the toy is wound, set down, and starts to think.
  windUp(u2.agentEnter + .55, .55, .45);
  clunk(u2.agentEnter + .58, .45, 1.3);
  spring(u2.firstThinking.at, tone(u2.firstThinking.at, 0, 67), .4, 0, .3, -3);
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { click(block.at, 91, .45, .3); continue; }
    plink(block.at, [0, 2, 1, 3, 2, 4, 3, 5, 4, 6][step % 10], 67, .6, step % 2 ? .3 : -.3); step++;
  }
  warning(u2.failure, 1.15);
  // The spring lets go: a wobble that sags.
  spring(u2.failure + .25, tone(u2.failure, 0, 55), .45, -.2, .8, -9);
  move(u2.upwardTurn, true, .45, [0, .3]);
  move(u2.backtrack, false, .45, [.4, -.4]);
  u2.drawers.forEach((time, i) => { clunk(time, .35, 1.4 + i * .15, -.3 + i * .3); plink(time + .03, i * 2, 72, .35, -.3 + i * .3); });
  plink(u2.highlight.at, 4, 79, .45);
  warning(u2.warning, 1);
  [0, 1, 2, 3].forEach(i => plink(u2.insights + i * .08, i, 71, .45, -.3 + i * .2));
  bell(mix, u2.insights + .35, tone(u2.insights, 2, 84), .35, WET, {decay: 1.4, ratio: 2, index: .7});
  move(u2.zoom, false, .5, [-.2, .2]);
  ratchet(u2.collapse.at, Math.min(.5, u2.collapse.duration), 7, 86, .4);
  move(u2.cloudIn, true, .45, [-.5, .3]);

  // Cost: little wind-up runners, a heavy tin robot, a key that runs out.
  move(cost.cloudOut, false, .4, [.3, -.4]);
  cost.cheapLegs.forEach((leg, i) => {
    const dir = i % 2 ? -1 : 1;
    for (let k = 0; k < 6; k++) click(leg.at + k * leg.duration / 6, 93 - (k % 2) * 5, .3, (-.7 + k * .28) * dir);
    spring(leg.at + leg.duration, tone(leg.at, 1, 74), .25, .6 * dir, .2, 2);
  });
  for (let i = 0; i < 3; i++) warning(cost.thinkingDrop.at + i * .13, .5 - i * .08, -.4 + i * .4);
  move(cost.cameraToBash, false, .45);
  spring(cost.bashEntry.at, tone(cost.bashEntry.at, 0, 55), .5, 0, .3, 3);
  clunk(cost.bashStop, .9, .75);
  string(mix, cost.bashStop, tone(cost.bashStop, 0, 31), .8, DRY, {length: 1, damping: .994, bright: .2});
  ratchet(cost.bashExpand, .3, 4, 86, .35);
  for (let i = 0; i < 7; i++) { const time = cost.bashDescent.at + cost.bashDescent.duration * .85 * i / 6; click(time, 84, .35, (i / 6 - .5) * .6); plink(time, 6 - i, 62, .35 - i * .02, (i / 6 - .5) * .6); }
  plink(cost.bashHighlight.at, 4, 79, .42);
  warning(cost.bashWarning, 1);
  move(cost.cameraToBudget, false, .45);
  glide(mix, cost.smokeEnter, 1.2, FX, {from: 300, to: 650, level: .22, peak: .3});
  spring(cost.budgetAppear, tone(cost.budgetAppear, 2, 72), .4, .2, .3, 2);
  // The key unwinding: clicks that slow and sink as the budget drains.
  for (let i = 0, t = cost.depletion.at, gap = .06; t < cost.depletion.at + cost.depletion.duration; i++, t += gap, gap *= 1.12)
    click(t, 88 - i * .6, .4 * (1 - i / 40), .3);
  clunk(cost.depletion.at + cost.depletion.duration, .45, .9, .2);

  // Flow-1: wound all the way — a long winding, then the release.
  windUp(flow.reveal - .02, 1.3, .6);
  spring(flow.reveal, tone(flow.reveal, 0, 55), .7, 0, .5, -12);
  [0, 1, 2, 3, 4].forEach(i => plink(flow.reveal + i * .05, i, 67, .55 - i * .05, -.4 + i * .2));
  bell(mix, flow.reveal + .1, tone(flow.reveal, 4, 86), .4, WET, {decay: 1.8, ratio: 2, index: .8});
  move(flow.cloudExit, false, .35, [0, .5]);
  move(flow.cameraZoom, true, .35);
  clunk(flow.benchmark, .3, 1.6);
  flow.numberDrops.forEach((time, i) => { plink(time, i, 67, .5, -.5 + i * .2); click(time, 86, .25, -.5 + i * .2); });
  ratchet(flow.countUp.at, flow.countUp.duration, Math.max(4, Math.round(flow.countUp.duration / .08)), 88, .3, [-.3, -.1]);
  move(flow.cameraToAnalysis, true, .45, [-.3, .3]);
  for (let i = 0; i < 5; i++) click(flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 5, 93, .3, -.5 + i * .25);
  move(flow.cameraToEngine, false, .45);
  [0, 2, 4].forEach((index, i) => plink(flow.moduleActivation + i * .06, index, 67, .45));
  ratchet(flow.engineSpinner.at, flow.engineSpinner.duration, 14, 90, .3, [-.4, .4]);
  move(flow.cover, false, .4);
  clunk(flow.coverShut, .75, .85);
  plink(flow.coverTint.at, 4, 79, .38);

  // Issues: Signals is a tidy little machine — it reads, writes, and sorts.
  const {prelude} = issues;
  spring(prelude.bashEntry.at, tone(prelude.bashEntry.at, 0, 55), .45, 0, .3, 3);
  clunk(prelude.bashStop, .7, .8);
  for (let i = 0; i < 6; i++) { const time = prelude.descent.at + prelude.descent.duration * .85 * i / 5; click(time, 84, .3); plink(time, 5 - i, 62, .32); }
  plink(prelude.highlight, 4, 79, .4);
  if (prelude.bubble !== undefined) { spring(prelude.bubble, tone(prelude.bubble, 2, 67), .5, 0, .4, -5); plink(prelude.bubble + .1, 2, 74, .4); }
  if (prelude.labels) [0, 1, 2].forEach(i => { const time = prelude.labels!.at + i * prelude.labels!.duration / 3; clunk(time, .22, 1.8, -.3 + i * .3); plink(time, i + 1, 72, .4, -.3 + i * .3); });
  // Report text: a tiny typewriter.
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .08 + .03 * ((i * 7) % 3), i++)
    click(t, 95 + (i % 3) * 2, .22 + .06 * ((i * 5) % 2), .15);
  if (prelude.explanation) bell(mix, prelude.explanation.at + prelude.explanation.duration, 96, .3, WET, {decay: .8, ratio: 2, index: .6});
  if (prelude.bubbleExit !== undefined) spring(prelude.bubbleExit, tone(prelude.bubbleExit, 3, 72), .4, 0, .35, 6);
  move(prelude.zoomOut, false, .5);
  ratchet(prelude.collapse, .45, 6, 86, .35);
  glide(mix, prelude.circleGrow.at, prelude.circleGrow.duration, FX, {from: 300, to: 1400, level: .3, peak: .8});
  for (const pop of radialPops(cues)) modal(mix, pop.at, tone(pop.at, Math.round(pop.height * 6), 72), .16, {...WET, pan: pop.pan}, MUSIC_BOX, {mallet: 6000, malletLevel: .15, length: .6, name: 'plink'});
  move(issues.travel, true, .35, [-.3, .3]);
  issues.clusters.forEach((time, i) => { click(time, 90, .35, -.5 + (i % 5) * .25); plink(time + .02, i % 5, 67, .45, -.5 + (i % 5) * .25); });
  move(issues.windowDown, false, .4);
  clunk(issues.windowShut, .7, .9);
  for (const [i, event] of issues.typingEvents.entries()) click(event.time, 93 + [0, 2, -1, 3][i % 4], .4, -.1 + (i % 3) * .1);
  warning(issues.issueBadge, .75, .3);
  spring(issues.messageSend, tone(issues.messageSend, 2, 74), .45, .3, .35, -6);
  ratchet(issues.messageSend, .35, 5, 90, .3, [0, .5]);
  warning(issues.queryBadge, .55, .3);
  move(issues.windowUp, true, .4);

  // Conclusion: the camera pulls back on a slow ratchet; the key clicks home on the logo.
  glide(mix, conclusion.start, 3.5, FX, {from: 1800, to: 400, level: .3, peak: .25});
  ratchet(conclusion.start, 3.5, 16, 84, .25, [-.2, .2]);
  click(conclusion.logo, 81, .6); clunk(conclusion.logo + .02, .45, 1.2);
}
