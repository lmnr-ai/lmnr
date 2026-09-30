import type {ScoreCues} from '../cues';
import {chordAt, radialPops, toneOf} from '../rounded';
import {bowed, pizz, timpani, type Mix, type Route} from '../voices';
import {note, run} from '../tempesta/instruments';
import {primaveraPlan, primaveraScale} from './composition';

/*
 * Primavera foley: the chamber orchestra plays the picture, softly. Camera moves are light violin
 * scales, blocks and pops are pizzicato in the key, warnings are a gentle bowed accent over a pluck,
 * and typing is a soft high spiccato. No noise sources and no drums beyond a soft timpani landing.
 */

const FX: Route = {bus: 'sfx', room: .12, hall: .42};
const DRY: Route = {bus: 'sfx', room: .1, hall: .25};

/** The strings never dip for the voice: one constant level reads as one performance. */
export const primaveraDucks = () => {};

export function designPrimavera(mix: Mix, cues: ScoreCues) {
  const plan = primaveraPlan(cues), {ultimate2: u2, cost, flow, issues} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const scaleAt = (time: number) => primaveraScale(cues, time);
  const move = (span: {at: number; duration: number}, up: boolean, level = 1) => {
    const duration = Math.max(.3, span.duration);
    const top = tone(span.at, 0, 83), bottom = tone(span.at, 0, 71);
    run(mix, span.at + duration * .3, span.at + duration, up ? bottom : top, up ? top : bottom, scaleAt(span.at), [.25 * level, .45 * level], {...FX, pan: up ? .3 : -.3}, {curve: 1.1, level: .45});
  };
  const accent = (time: number, level = 1, pan = 0) => {
    const chord = chordAt(plan, time);
    chord.pad.slice(-3).forEach((midi, i) => bowed(mix, time, time + .35, midi + 12, {...FX, pan: pan - .2 + i * .2}, {section: 'violins', dynamics: [.55, .3], attack: .02, release: .5, level: .4 * level, bright: .5}));
    pizz(mix, time, chord.bass + 12, .5 * level, {...DRY, pan}, {length: .6});
  };
  /** A landing: a soft timpani and a low celli stroke on the chord root. */
  const thud = (time: number, level: number) => {
    const {bass} = chordAt(plan, time);
    timpani(mix, time, bass < 36 ? bass + 12 : bass, level, FX, {decay: 1.2});
    bowed(mix, time, time + .3, bass, FX, {section: 'celli', dynamics: [.6, .3], attack: .02, release: .6, level: .6 * level});
  };
  const plucked = (time: number, index: number, level: number, pan = 0) => pizz(mix, time, tone(time, index, 67), level, {...DRY, pan}, {length: .6});

  // Ultimate2
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { pizz(mix, block.at, tone(block.at, 0, 83), .35, {...DRY, pan: .3}, {length: .4}); continue; }
    plucked(block.at, step % 6, .4, step % 2 ? .3 : -.3); step++;
  }
  thud(u2.failure, .3);
  move(u2.upwardTurn, true, .7);
  move(u2.backtrack, false, .7);
  accent(u2.warning, .9);
  move(u2.zoom, false, .8);
  for (let i = 0; i < 6; i++) plucked(u2.collapse.at + i * .08, 5 - i, .35, (i - 2.5) * .15);
  move(u2.cloudIn, true, .7);

  // Cost
  move(cost.cloudOut, false, .7);
  cost.cheapLegs.forEach((leg, i) => { for (let k = 0; k < 4; k++) pizz(mix, leg.at + k * leg.duration / 4, tone(leg.at, k + i, 76), .35, {...DRY, pan: leg.direction === 'leftToRight' ? -.6 + k * .4 : .6 - k * .4}, {length: .4}); });
  move(cost.cameraToBash, false, .7);
  for (let i = 0; i < 8; i++) plucked(cost.bashDescent.at + i * cost.bashDescent.duration * .85 / 8, 7 - i, .32, (i - 3.5) * .12);
  accent(cost.bashWarning, .9);
  move(cost.cameraToBudget, false, .7);
  thud(cost.budgetAppear, .25);
  for (let t = cost.budgetRun.at, i = 0; t < cost.depletion.at; t += .1, i++) pizz(mix, t, tone(t, Math.max(0, 9 - i), 67), .3, {...DRY, pan: .3}, {length: .3});

  // Flow-1
  move(flow.cloudExit, false, .6);
  move(flow.cameraZoom, true, .6);
  flow.numberDrops.forEach((time, i) => plucked(time, 5 - i, .4, -.5 + i * .2));
  for (let i = 0; i < 10; i++) pizz(mix, flow.countUp.at + i * flow.countUp.duration / 10, tone(flow.countUp.at, i, 67), .3, {...DRY, pan: -.2}, {length: .3});
  move(flow.cameraToAnalysis, true, .8);
  for (let i = 0; i < 8; i++) pizz(mix, flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 8, tone(flow.analysisCountUp.at, i + 2, 67), .3, {...DRY, pan: .2}, {length: .3});
  move(flow.cameraToEngine, true, .7);
  for (let i = 0; i < 12; i++) plucked(flow.engineSpinner.at + i * flow.engineSpinner.duration / 12, i % 5, .28, Math.sin(i * 1.3) * .6);

  // Issues
  const {prelude} = issues;
  move({at: issues.leadIn.at, duration: .5}, true, .5);
  thud(prelude.bashStop, .25);
  for (let i = 0; i < 7; i++) plucked(prelude.descent.at + i * prelude.descent.duration * .85 / 7, 6 - i, .32, (i - 3) * .12);
  if (prelude.bubble !== undefined) run(mix, prelude.bubble, prelude.bubble + .3, tone(prelude.bubble, 0, 74), tone(prelude.bubble, 0, 83), scaleAt(prelude.bubble), [.3, .45], {...FX, pan: .2}, {level: .4});
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .15, i++)
    pizz(mix, t, tone(t, 4 + (i % 3), 67), .25, {...DRY, pan: .15}, {length: .25});
  move(prelude.zoomOut, false, .8);
  for (let i = 0; i < 6; i++) plucked(prelude.collapse + i * .07, 5 - i, .32, (i - 2.5) * .15);
  // 47 pops land inside 1.7 s, so each one is quiet or the cluster stacks into the limiter.
  for (const pop of radialPops(cues)) pizz(mix, pop.at, tone(pop.at, Math.round(pop.height * 8), 67), .1, {...DRY, pan: pop.pan}, {length: .3});
  move(issues.travel, true, .6);
  move(issues.windowDown, false, .6);
  for (const [i, event] of issues.typingEvents.entries()) note(mix, event.time, tone(event.time, i % 4, 79), .04, .3, {...DRY, pan: -.1 + (i % 3) * .1}, {level: .35, bright: .5});
  accent(issues.issueBadge, .8, .3);
  run(mix, issues.messageSend - .1, issues.messageSend + .25, tone(issues.messageSend, 0, 74), tone(issues.messageSend, 0, 86), scaleAt(issues.messageSend), [.3, .5], {...FX, pan: .3}, {level: .45});
  accent(issues.queryBadge, .6, .3);
  move(issues.windowUp, true, .6);
}
