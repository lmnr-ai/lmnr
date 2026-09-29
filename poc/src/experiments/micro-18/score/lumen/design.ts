import type {ScoreCues} from '../cues';
import {blip, bubble, chordAt, glide, radialPops, toneOf} from '../rounded';
import {beep, bell, dive, type Mix, type Route} from '../voices';
import {lumenPlan} from './composition';

/*
 * Lumen foley: light and data. Motion is tuned air with a sine riding it; arrivals are FM glass
 * pings; small things (blocks, beads, typing, pops) are sine chirps that bend into chord tones.
 * Tier 1 warnings are a soft two-tone triangle fall over a sub dip — the only non-sine sound here.
 */

const FX: Route = {bus: 'sfx', room: .2, hall: .15};
const WET: Route = {bus: 'sfx', room: .15, hall: .4, delay: .18};
const DRY: Route = {bus: 'sfx', room: .1};

export function lumenDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, flow, issues} = cues;
  for (const time of [u2.failure, u2.warning, cost.bashWarning, issues.issueBadge]) mix.duck(time, .5, .02, .3, .6);
  mix.duck(cost.thinkingDrop.at, .6, .02, .45, .5);
  mix.duck(flow.coverShut, .7, .02, .1, .4);
}

export function designLumen(mix: Mix, cues: ScoreCues) {
  const plan = lumenPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const chirp = (time: number, index: number, floor: number, velocity: number, pan = 0, bend = 7) =>
    blip(mix, time, tone(time, index, floor), velocity, {...FX, pan}, {length: .07, bend, bendTime: .012, warmth: .25});
  const ping = (time: number, index: number, floor: number, velocity: number, pan = 0, decay = 1.1) =>
    bell(mix, time, tone(time, index, floor), velocity, {...WET, pan}, {decay, ratio: 3.5, index: 1.2});
  /** Motion: filtered air carrying a sine that slides between two chord tones. */
  const move = (span: {at: number; duration: number}, up: boolean, level: number, pan: [number, number] = [0, 0]) => {
    const low = tone(span.at, 0, 64), high = tone(span.at, 4, 64);
    glide(mix, span.at, Math.max(.3, span.duration), FX, {from: up ? 600 : 2600, to: up ? 2600 : 600, level, panFrom: pan[0], panTo: pan[1], tone: up ? [low, high] : [high, low], toneLevel: .06});
  };
  const warning = (time: number, level = 1, pan = 0) => {
    beep(mix, time, tone(time, 2, 74), .55 * level, {...WET, pan}, {length: .12, wave: 'triangle'});
    beep(mix, time + .13, tone(time, 0, 69), .5 * level, {...WET, pan}, {length: .2, wave: 'triangle', glide: -.5});
    dive(mix, time, .35, {...DRY, pan}, {fromMidi: 50, toMidi: 38, level: .45 * level});
  };
  const cascade = (start: number, duration: number, count: number, from: number, step: number, velocity: number, floor = 66) => {
    for (let i = 0; i < count; i++) {
      const time = start + duration * i / Math.max(1, count - 1);
      chirp(time, Math.max(0, from + step * i), floor, velocity * (1 - i / count * .3), (i / Math.max(1, count - 1) - .5) * .8, step > 0 ? 5 : -5);
    }
  };

  // Ultimate2: the light switches on and every block it emits is a chirp.
  glide(mix, u2.agentEnter, .6, FX, {from: 400, to: 3000, level: .35, peak: .7, tone: [64, 76], toneLevel: .08});
  ping(u2.agentEnter + .35, 0, 69, .55);
  cascade(u2.firstThinking.at, .3, 3, 0, 2, .3, 76);
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { beep(mix, block.at, tone(block.at, 3, 88), .18, {...FX, pan: .3}, {length: .025}); continue; }
    chirp(block.at, [0, 2, 4, 3, 5, 4, 6, 5, 7, 6][step % 10], 69, .5, step % 2 ? .3 : -.3); step++;
  }
  warning(u2.failure, 1.1);
  move(u2.upwardTurn, true, .4, [0, .3]);
  move(u2.backtrack, false, .4, [.4, -.4]);
  u2.drawers.forEach((time, i) => { chirp(time, 1 + i * 2, 69, .45, -.3 + i * .3, 4); beep(mix, time, 50 + i * 2, .25, DRY, {length: .05}); });
  ping(u2.highlight.at, 4, 76, .45);
  warning(u2.warning, 1);
  [0, 1, 2, 3, 4].forEach(i => ping(u2.insights + i * .06, i, 69, .42 - i * .03, -.4 + i * .2, 1.6));
  move(u2.zoom, false, .45, [-.2, .2]);
  cascade(u2.collapse.at, Math.min(.45, u2.collapse.duration), 6, 6, -1, .3);
  move(u2.cloudIn, true, .4, [-.5, .3]);

  // Cost: cheap agents flicker past; the powerful one lands with weight; the budget is a draining light.
  move(cost.cloudOut, false, .35, [.3, -.4]);
  cost.cheapLegs.forEach((leg, i) => {
    const dir = i % 2 ? -1 : 1;
    for (let k = 0; k < 4; k++) chirp(leg.at + k * leg.duration / 4, k, 76, .22, (-.7 + k * .45) * dir, 3);
  });
  for (let i = 0; i < 3; i++) warning(cost.thinkingDrop.at + i * .14, .5 - i * .08, -.4 + i * .4);
  move(cost.cameraToBash, false, .4);
  chirp(cost.bashEntry.at, 0, 62, .5, 0, 12);
  dive(mix, cost.bashStop, .3, DRY, {fromMidi: 45, toMidi: 33, level: .4});
  ping(cost.bashStop, 0, 57, .5, 0, .8);
  glide(mix, cost.bashExpand, .35, FX, {from: 700, to: 2200, level: .25});
  cascade(cost.bashDescent.at, cost.bashDescent.duration * .85, 8, 7, -1, .38, 62);
  ping(cost.bashHighlight.at, 4, 76, .42);
  warning(cost.bashWarning, 1);
  move(cost.cameraToBudget, false, .4);
  glide(mix, cost.smokeEnter, 1.2, FX, {from: 350, to: 800, level: .22, peak: .3});
  ping(cost.budgetAppear, 2, 72, .5);
  for (let t = cost.budgetRun.at; t < cost.depletion.at; t += .25) beep(mix, t, tone(t, 1, 84), .12, {...FX, pan: .35}, {length: .03});
  // The budget dims: each blip lower, quieter, further apart.
  for (let i = 0, t = cost.depletion.at; t < cost.depletion.at + cost.depletion.duration; i++, t += .13 * 1.2 ** i)
    blip(mix, t, tone(t, Math.max(0, 7 - i), 62) - i * .3, .35 - i * .025, {...FX, pan: .3 - i * .06}, {length: .08, bend: -2, warmth: .1});

  // Flow-1: light floods in.
  move(flow.entry, true, .45);
  [0, 1, 2, 3, 4, 5].forEach(i => ping(flow.reveal + i * .035, i, 69, .55 - i * .05, -.5 + i * .2, 1.8));
  move(flow.cloudExit, false, .3, [0, .5]);
  move(flow.cameraZoom, true, .3);
  ping(flow.benchmark, 2, 76, .45);
  flow.numberDrops.forEach((time, i) => chirp(time, i, 69, .5, -.5 + i * .2, -6));
  const ticks = Math.max(4, Math.round(flow.countUp.duration / .08));
  for (let i = 0; i < ticks; i++) beep(mix, flow.countUp.at + i * flow.countUp.duration / ticks, 76 + Math.round(i * 12 / ticks), .12, {...FX, pan: -.2}, {length: .025});
  move(flow.cameraToAnalysis, true, .4, [-.3, .3]);
  cascade(flow.cameraToAnalysis.at + .2, flow.cameraToAnalysis.duration * .7, 8, 0, 1, .3);
  for (let i = 0; i < 5; i++) beep(mix, flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 5, 88, .14, {...FX, pan: -.5 + i * .25}, {length: .02});
  move(flow.cameraToEngine, false, .4);
  [0, 2, 4].forEach((index, i) => ping(flow.moduleActivation + i * .05, index, 69, .45));
  for (let i = 0; i < 12; i++) blip(mix, flow.engineSpinner.at + i * flow.engineSpinner.duration / 12, tone(flow.engineSpinner.at, i % 4, 81), .14, {...FX, pan: Math.sin(i * Math.PI / 3) * .6}, {length: .04, bend: 2});
  move(flow.cover, false, .35);
  dive(mix, flow.coverShut, .3, DRY, {fromMidi: 45, toMidi: 33, level: .35});
  beep(mix, flow.coverShut, 45, .3, DRY, {length: .06});
  ping(flow.coverTint.at, 4, 76, .38);

  // Issues: Signals reads, reports, and the issues light up across the field.
  const {prelude} = issues;
  chirp(prelude.bashEntry.at, 0, 62, .5, 0, 12);
  dive(mix, prelude.bashStop, .3, DRY, {fromMidi: 45, toMidi: 33, level: .35});
  cascade(prelude.descent.at, prelude.descent.duration * .85, 7, 6, -1, .34, 62);
  ping(prelude.highlight, 4, 76, .4);
  if (prelude.bubble !== undefined) { glide(mix, prelude.bubble, .35, FX, {from: 500, to: 2600, level: .3, tone: [69, 81], toneLevel: .08}); ping(prelude.bubble + .1, 2, 72, .45); }
  if (prelude.labels) [0, 1, 2].forEach(i => chirp(prelude.labels!.at + i * prelude.labels!.duration / 3, i * 2, 72, .42, -.3 + i * .3, 5));
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .08 + .03 * ((i * 7) % 3), i++)
    beep(mix, t, tone(t, i % 4, 84), .08 + .03 * ((i * 5) % 2), {...FX, pan: .15}, {length: .02});
  if (prelude.bubbleExit !== undefined) glide(mix, prelude.bubbleExit, .4, FX, {from: 2600, to: 500, level: .3});
  move(prelude.zoomOut, false, .45);
  cascade(prelude.collapse, .4, 5, 5, -1, .25);
  glide(mix, prelude.circleGrow.at, prelude.circleGrow.duration, FX, {from: 300, to: 1800, level: .3, peak: .8, tone: [57, 69], toneLevel: .05});
  for (const pop of radialPops(cues)) bell(mix, pop.at, tone(pop.at, Math.round(pop.height * 6), 72), .22, {...WET, pan: pop.pan}, {decay: .6, ratio: 3.5, index: .8});
  move(issues.travel, true, .3, [-.3, .3]);
  issues.clusters.forEach((time, i) => ping(time, i % 5, 69, .4, -.5 + (i % 5) * .25, .9));
  move(issues.windowDown, false, .35);
  dive(mix, issues.windowShut, .25, DRY, {fromMidi: 48, toMidi: 36, level: .3});
  for (const [i, event] of issues.typingEvents.entries()) beep(mix, event.time, tone(event.time, [0, 2, 1, 3][i % 4], 81), .16, {...FX, pan: -.1 + (i % 3) * .1}, {length: .025});
  warning(issues.issueBadge, .75, .3);
  glide(mix, issues.messageSend, .45, FX, {from: 800, to: 3600, level: .35, peak: .6, panFrom: 0, panTo: .4, tone: [69, 88], toneLevel: .07});
  warning(issues.queryBadge, .55, .3);
  move(issues.windowUp, true, .35);

  // Conclusion: the pull-back is a long falling breath, the logo a burst of light.
  glide(mix, conclusion.start, 3.5, FX, {from: 2200, to: 400, level: .3, peak: .25});
  bubble(mix, conclusion.logo - .02, 57, .5, WET, {rise: 24, length: .35});
}
