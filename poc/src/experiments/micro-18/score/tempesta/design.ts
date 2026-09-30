import type {ScoreCues} from '../cues';
import {chordAt, radialPops, toneOf} from '../rounded';
import {bowed, impact, pizz, timpani, whoosh, type Mix, type Route} from '../voices';
import {taiko} from '../overdrive/instruments';
import {tempestaPlan, tempestaScale} from './composition';
import {note, run} from './instruments';

/*
 * Tempesta foley: the orchestra plays the picture too. Camera moves are violin swoops over a soft
 * whoosh with a timpani arrival, blocks and pops are pizzicato in the key, warnings are sforzando
 * stabs, and typing is short high spiccato.
 */

const FX: Route = {bus: 'sfx', room: .12, hall: .3};
const DRY: Route = {bus: 'sfx', room: .1, hall: .12};

export function tempestaDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.warning, cost.bashWarning, issues.issueBadge]) mix.duck(time, .55, .02, .35, .4);
}

export function designTempesta(mix: Mix, cues: ScoreCues) {
  const plan = tempestaPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const scaleAt = (time: number) => tempestaScale(cues, time);
  const move = (span: {at: number; duration: number}, up: boolean, level = 1) => {
    const duration = Math.max(.3, span.duration);
    whoosh(mix, span.at, duration, FX, {from: up ? 400 : 1600, to: up ? 1800 : 300, level: .3 * level, panFrom: up ? -.6 : .6, panTo: up ? .6 : -.6, peak: .8, air: .4});
    const top = tone(span.at, 0, 86), bottom = tone(span.at, 0, 67);
    run(mix, span.at + duration * .2, span.at + duration, up ? bottom : top, up ? top : bottom, scaleAt(span.at), [.35 * level, .7 * level], {...FX, pan: up ? .3 : -.3}, {curve: 1.2, level: .6});
    timpani(mix, span.at + duration, chordAt(plan, span.at + duration).bass + 12, .35 * level, FX, {decay: .8});
  };
  const stab = (time: number, level = 1, pan = 0) => {
    const chord = chordAt(plan, time);
    [chord.bass + 12, ...chord.pad.slice(-3)].forEach((midi, i) => bowed(mix, time, time + .14, midi + (i ? 12 : 0), {...FX, pan: pan - .2 + i * .15}, {section: i ? 'violin' : 'celli', dynamics: [1, .6], attack: .003, release: .2, level: .7 * level, bright: .9}));
    taiko(mix, time, .35 * level, FX, .8);
  };
  const plucked = (time: number, index: number, level: number, pan = 0) => pizz(mix, time, tone(time, index, 67), level, {...DRY, pan}, {length: .6});

  // Ultimate2
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { note(mix, block.at, tone(block.at, 0, 86), .05, .5, {...DRY, pan: .3}, {level: .5}); continue; }
    plucked(block.at, step % 6, .55, step % 2 ? .3 : -.3); step++;
  }
  impact(mix, u2.failure, .4, FX);
  move(u2.upwardTurn, true, .7);
  move(u2.backtrack, false, .7);
  stab(u2.warning);
  move(u2.zoom, false, .9);
  for (let i = 0; i < 6; i++) plucked(u2.collapse.at + i * .08, 5 - i, .45, (i - 2.5) * .15);
  move(u2.cloudIn, true, .8);

  // Cost
  move(cost.cloudOut, false, .7);
  cost.cheapLegs.forEach((leg, i) => { for (let k = 0; k < 4; k++) note(mix, leg.at + k * leg.duration / 4, tone(leg.at, k + i, 79), .07, .5, {...DRY, pan: leg.direction === 'leftToRight' ? -.6 + k * .4 : .6 - k * .4}, {level: .5}); });
  move(cost.cameraToBash, false, .8);
  for (let i = 0; i < 8; i++) plucked(cost.bashDescent.at + i * cost.bashDescent.duration * .85 / 8, 7 - i, .4, (i - 3.5) * .12);
  stab(cost.bashWarning);
  move(cost.cameraToBudget, false, .8);
  impact(mix, cost.budgetAppear, .3, FX);
  for (let t = cost.budgetRun.at, i = 0; t < cost.depletion.at; t += .08, i++) pizz(mix, t, tone(t, Math.max(0, 9 - i), 67), .4, {...DRY, pan: .3}, {length: .3});

  // Flow-1
  whoosh(mix, flow.entry.at, flow.reveal - flow.entry.at, FX, {from: 300, to: 2200, level: .4, peak: .97, air: .5});
  move(flow.cloudExit, false, .7);
  move(flow.cameraZoom, true, .7);
  flow.numberDrops.forEach((time, i) => plucked(time, 5 - i, .5, -.5 + i * .2));
  for (let i = 0; i < 10; i++) pizz(mix, flow.countUp.at + i * flow.countUp.duration / 10, tone(flow.countUp.at, i, 67), .4, {...DRY, pan: -.2}, {length: .3});
  move(flow.cameraToAnalysis, true, .9);
  for (let i = 0; i < 8; i++) pizz(mix, flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 8, tone(flow.analysisCountUp.at, i + 2, 67), .4, {...DRY, pan: .2}, {length: .3});
  move(flow.cameraToEngine, true, .8);
  for (let i = 0; i < 12; i++) plucked(flow.engineSpinner.at + i * flow.engineSpinner.duration / 12, i % 5, .35, Math.sin(i * 1.3) * .6);
  whoosh(mix, flow.cover.at, flow.cover.duration + .1, FX, {from: 400, to: 1600, level: .4, peak: .95});

  // Issues
  const {prelude} = issues;
  move({at: issues.leadIn.at, duration: .5}, true, .6);
  impact(mix, prelude.bashStop, .3, FX);
  for (let i = 0; i < 7; i++) plucked(prelude.descent.at + i * prelude.descent.duration * .85 / 7, 6 - i, .4, (i - 3) * .12);
  if (prelude.bubble !== undefined) run(mix, prelude.bubble, prelude.bubble + .3, tone(prelude.bubble, 0, 74), tone(prelude.bubble, 0, 86), scaleAt(prelude.bubble), [.4, .6], {...FX, pan: .2}, {level: .5});
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .12, i++)
    pizz(mix, t, tone(t, 4 + (i % 3), 67), .3, {...DRY, pan: .15}, {length: .25});
  move(prelude.zoomOut, false, .9);
  for (let i = 0; i < 6; i++) plucked(prelude.collapse + i * .07, 5 - i, .4, (i - 2.5) * .15);
  for (const pop of radialPops(cues)) pizz(mix, pop.at, tone(pop.at, Math.round(pop.height * 8), 67), .3, {...DRY, pan: pop.pan}, {length: .4});
  move(issues.travel, true, .7);
  move(issues.windowDown, false, .7);
  for (const [i, event] of issues.typingEvents.entries()) note(mix, event.time, tone(event.time, i % 4, 84), .04, .45, {...DRY, pan: -.1 + (i % 3) * .1}, {level: .45});
  stab(issues.issueBadge, .85, .3);
  run(mix, issues.messageSend - .1, issues.messageSend + .25, tone(issues.messageSend, 0, 74), tone(issues.messageSend, 0, 91), scaleAt(issues.messageSend), [.5, .8], {...FX, pan: .3}, {level: .6});
  stab(issues.queryBadge, .6, .3);
  move(issues.windowUp, true, .7);

  // Conclusion: the pull back.
  whoosh(mix, conclusion.start, conclusion.logo - conclusion.start, FX, {from: 250, to: 2200, level: .4, peak: .97, air: .6});
}
