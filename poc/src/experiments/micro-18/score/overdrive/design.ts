import type {ScoreCues} from '../cues';
import {chordAt, radialPops, toneOf} from '../rounded';
import {dive, impact, whoosh, type Mix, type Route} from '../voices';
import {cymbal} from '../bluenote/instruments';
import {overdrivePlan} from './composition';
import {alarm, bigKick, lead, stab, taiko, zap} from './instruments';

/*
 * Overdrive foley: nothing moves quietly. Every camera move is a big whoosh with a sub hit on
 * arrival, every block is a laser zap in the key, warnings are klaxons, and the small beats land on
 * supersaw stabs.
 */

const FX: Route = {bus: 'sfx', room: .15, hall: .25};
const DRY: Route = {bus: 'sfx', room: .1};

export function overdriveDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.warning, cost.bashWarning, issues.issueBadge]) mix.duck(time, .6, .02, .45, .4);
  mix.duck(cost.thinkingDrop.at, .6, .02, .6, .4);
}

export function designOverdrive(mix: Mix, cues: ScoreCues) {
  const plan = overdrivePlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const move = (span: {at: number; duration: number}, up: boolean, level = 1) => {
    const duration = Math.max(.3, span.duration);
    whoosh(mix, span.at, duration, FX, {from: up ? 300 : 1800, to: up ? 2200 : 250, level: .6 * level, panFrom: up ? -.7 : .7, panTo: up ? .7 : -.7, peak: .75, air: .5, tone: up ? 52 : 40});
    impact(mix, span.at + duration, .35 * level, FX);
    bigKick(mix, span.at + duration, .45 * level, DRY, .3);
  };
  const klaxon = (time: number, level = 1, pan = 0) => {
    alarm(mix, time, .55, .9 * level, {...DRY, pan});
    stab(mix, time, [tone(time, 0, 62), tone(time, 0, 62) + 6, tone(time, 0, 62) + 12], .18, .7 * level, {...FX, pan});
    taiko(mix, time, .5 * level, FX, 1.2);
  };
  const laser = (time: number, index: number, level: number, pan = 0) => {
    const midi = tone(time, index, 74);
    zap(mix, time, .8 * level, {...DRY, pan}, {from: 440 * 2 ** ((midi + 12 - 69) / 12), to: 440 * 2 ** ((midi - 24 - 69) / 12), duration: .14});
  };

  // Ultimate2
  whoosh(mix, 0, .5, FX, {from: 2000, to: 200, level: .6, peak: .1, tone: 38});
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { cymbal(mix, block.at, 'hat', .6, {...DRY, pan: .3}, {decay: .05}); zap(mix, block.at, .4, DRY, {from: 5000, to: 1500, duration: .06}); continue; }
    laser(block.at, step % 5, .75, step % 2 ? .35 : -.35); step++;
  }
  dive(mix, u2.failure, 1.2, FX, {fromMidi: 84, toMidi: 30, level: .5});
  move(u2.upwardTurn, true, .8);
  move(u2.backtrack, false, .8);
  u2.drawers.forEach((time, i) => { taiko(mix, time, .45, {...FX, pan: -.4 + i * .4}, 1 + i * .15); laser(time, i * 2, .5, -.4 + i * .4); });
  stab(mix, u2.highlight.at, chordAt(plan, u2.highlight.at).pad, .12, .5, FX);
  klaxon(u2.warning);
  move(u2.zoom, false, 1.1);
  for (let i = 0; i < 6; i++) laser(u2.collapse.at + i * .08, 5 - i, .45, (i - 2.5) * .15);
  move(u2.cloudIn, true, .9);

  // Cost
  move(cost.cloudOut, false, .8);
  cost.cheapLegs.forEach((leg, i) => { for (let k = 0; k < 4; k++) laser(leg.at + k * leg.duration / 4, k + i, .35, leg.direction === 'leftToRight' ? -.6 + k * .4 : .6 - k * .4); });
  for (let i = 0; i < 3; i++) klaxon(cost.thinkingDrop.at + i * .35, .8 - i * .1, -.4 + i * .4);
  move(cost.cameraToBash, false, .9);
  whoosh(mix, cost.bashEntry.at, cost.bashEntry.duration, FX, {from: 400, to: 2000, level: .5, peak: .9});
  stab(mix, cost.bashExpand, chordAt(plan, cost.bashExpand).pad, .15, .55, FX);
  for (let i = 0; i < 8; i++) laser(cost.bashDescent.at + i * cost.bashDescent.duration * .85 / 8, 7 - i, .35, (i - 3.5) * .12);
  stab(mix, cost.bashHighlight.at, chordAt(plan, cost.bashHighlight.at).pad, .12, .5, FX);
  klaxon(cost.bashWarning);
  move(cost.cameraToBudget, false, .9);
  whoosh(mix, cost.smokeEnter, 1, FX, {from: 200, to: 1200, level: .4, peak: .5});
  impact(mix, cost.budgetAppear, .4, FX);
  for (let t = cost.budgetRun.at, i = 0; t < cost.depletion.at; t += .08, i++) zap(mix, t, .25 + .01 * i, {...DRY, pan: .3}, {from: 2400 - i * 60, to: 900, duration: .05});
  dive(mix, cost.depletion.at, cost.depletion.duration * .7, FX, {fromMidi: 86, toMidi: 26, level: .6});
  klaxon(cost.depletion.at, .7);

  // Flow-1
  whoosh(mix, flow.entry.at, flow.reveal - flow.entry.at, FX, {from: 250, to: 2400, level: .7, peak: .98, air: .6});
  move(flow.cloudExit, false, .8);
  move(flow.cameraZoom, true, .8);
  impact(mix, flow.benchmark, .4, FX);
  flow.numberDrops.forEach((time, i) => { taiko(mix, time, .35, {...FX, pan: -.5 + i * .2}, 1.3); laser(time, 5 - i, .4, -.5 + i * .2); });
  for (let i = 0; i < 12; i++) zap(mix, flow.countUp.at + i * flow.countUp.duration / 12, .3, {...DRY, pan: -.2}, {from: 1500 + i * 200, to: 1200 + i * 200, duration: .04});
  move(flow.cameraToAnalysis, true, 1);
  for (let i = 0; i < 8; i++) zap(mix, flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 8, .3, {...DRY, pan: .2}, {from: 1800 + i * 250, to: 1400 + i * 250, duration: .04});
  move(flow.cameraToEngine, true, .9);
  for (let i = 0; i < 12; i++) laser(flow.engineSpinner.at + i * flow.engineSpinner.duration / 12, i % 5, .3, Math.sin(i * 1.3) * .6);
  whoosh(mix, flow.cover.at, flow.cover.duration + .1, FX, {from: 400, to: 1800, level: .6, peak: .95});

  // Issues
  const {prelude} = issues;
  move({at: issues.leadIn.at, duration: .5}, true, .7);
  whoosh(mix, prelude.bashEntry.at, prelude.bashEntry.duration, FX, {from: 400, to: 2000, level: .45, peak: .9});
  impact(mix, prelude.bashStop, .4, FX);
  for (let i = 0; i < 7; i++) laser(prelude.descent.at + i * prelude.descent.duration * .85 / 7, 6 - i, .35, (i - 3) * .12);
  stab(mix, prelude.highlight, chordAt(plan, prelude.highlight).pad, .12, .5, FX);
  if (prelude.bubble !== undefined) lead(mix, prelude.bubble, tone(prelude.bubble, 4, 74), .3, .6, {...FX, pan: .2}, {from: tone(prelude.bubble, 4, 74) - 12});
  if (prelude.labels) [0, 1, 2].forEach(i => stab(mix, prelude.labels!.at + i * prelude.labels!.duration / 3, chordAt(plan, prelude.labels!.at).pad.map(midi => midi + 12), .1, .45, {...FX, pan: -.3 + i * .3}));
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .09, i++)
    zap(mix, t, .18, {...DRY, pan: .15}, {from: 3000 + (i % 3) * 400, to: 2200, duration: .03});
  if (prelude.bubbleExit !== undefined) whoosh(mix, prelude.bubbleExit, .4, FX, {from: 1500, to: 300, level: .4});
  move(prelude.zoomOut, false, 1);
  for (let i = 0; i < 6; i++) laser(prelude.collapse + i * .07, 5 - i, .4, (i - 2.5) * .15);
  whoosh(mix, prelude.circleGrow.at, prelude.circleGrow.duration, FX, {from: 250, to: 2400, level: .55, peak: .95, air: .6});
  for (const pop of radialPops(cues)) laser(pop.at, Math.round(pop.height * 6), .2, pop.pan);
  move(issues.travel, true, .8);
  issues.clusters.forEach((time, i) => laser(time + .02, i % 5, .35, -.5 + (i % 5) * .25));
  move(issues.windowDown, false, .8);
  taiko(mix, issues.windowShut, .8, FX); impact(mix, issues.windowShut, .5, FX);
  for (const [i, event] of issues.typingEvents.entries()) zap(mix, event.time, .3, {...DRY, pan: -.1 + (i % 3) * .1}, {from: 4000, to: 2000, duration: .035});
  klaxon(issues.issueBadge, .85, .3);
  whoosh(mix, issues.messageSend - .15, .45, FX, {from: 500, to: 2400, level: .6, peak: .7, panFrom: -.5, panTo: .8});
  lead(mix, issues.messageSend, tone(issues.messageSend, 4, 76), .35, .7, {...FX, pan: .3}, {from: tone(issues.messageSend, 4, 76) - 12});
  klaxon(issues.queryBadge, .6, .3);
  move(issues.windowUp, true, .8);

  // Conclusion: the pull back is the biggest whoosh in the film.
  whoosh(mix, conclusion.start, conclusion.logo - conclusion.start, FX, {from: 200, to: 2400, level: .6, peak: .97, air: .7, tone: 38});
}
