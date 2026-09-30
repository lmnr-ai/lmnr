import type {ScoreCues} from '../cues';
import {KALIMBA, MARIMBA, VIBE, WOOD, GLASS, blip, bubble, chordAt, glide, modal, radialPops, toneOf} from '../rounded';
import type {Mix, Route} from '../voices';
import {tidepoolPlan} from './composition';

/*
 * Tidepool foley, in three tiers. Tier 1 (failure, warnings, Flow-1, logo) owns the frame; tier 2
 * (camera, entries, drawers, bash, budget, cover, window) is air and wood; tier 3 (blocks, beads,
 * typing, labels, pops) is droplets. Every pitched sound is a tone of the chord under it.
 */

const FX: Route = {bus: 'sfx', room: .3, hall: .12};
const WET: Route = {bus: 'sfx', room: .2, hall: .35, delay: .12};
const DRY: Route = {bus: 'sfx', room: .15};

export function tidepoolDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.failure, u2.warning, cost.bashWarning, issues.issueBadge]) mix.duck(time, .55, .03, .25, .6);
  for (const time of cost.thinkingDrop.duration ? [cost.thinkingDrop.at] : []) mix.duck(time, .7, .03, .4, .5);
}

export function designTidepool(mix: Mix, cues: ScoreCues) {
  const plan = tidepoolPlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const drop = (time: number, index: number, floor: number, velocity: number, pan = 0, route = WET) =>
    modal(mix, time, tone(time, index, floor), velocity, {...route, pan}, KALIMBA, {mallet: 3200, malletLevel: .2, name: 'drop'});
  const wood = (time: number, midi: number, velocity: number, pan = 0) => modal(mix, time, midi, velocity, {...DRY, pan}, WOOD, {mallet: 2400, malletLevel: .5, name: 'wood'});
  const air = (span: {at: number; duration: number}, from: number, to: number, level: number, pan: [number, number] = [0, 0]) =>
    glide(mix, span.at, Math.max(.25, span.duration), FX, {from, to, level, panFrom: pan[0], panTo: pan[1]});
  const run = (start: number, duration: number, count: number, from: number, step: number, velocity: number, partials = MARIMBA) => {
    for (let i = 0; i < count; i++) {
      const time = start + duration * i / Math.max(1, count - 1);
      modal(mix, time, tone(time, Math.max(0, from + step * i), 55), velocity * (1 - i / count * .3), {...FX, pan: (i / Math.max(1, count - 1) - .5) * .6}, partials, {mallet: 2200, name: 'run'});
    }
  };
  /** Tier 1: a low marimba knock and a falling glass third. Concerned, never alarming. */
  const warning = (time: number, level = 1, pan = 0) => {
    modal(mix, time, tone(time, 0, 38), .8 * level, {...DRY, pan}, MARIMBA, {mallet: 600, malletLevel: .4, name: 'warning'});
    modal(mix, time + .02, tone(time, 2, 76), .55 * level, {...WET, pan}, GLASS, {name: 'warning'});
    modal(mix, time + .16, tone(time, 1, 72), .45 * level, {...WET, pan}, GLASS, {name: 'warning'});
    bubble(mix, time, 62, .35 * level, {...FX, pan}, {rise: -12, length: .22});
  };

  // Ultimate2: the agent surfaces, thinks, and its stream plays the melody.
  bubble(mix, u2.agentEnter + .05, 67, .7, WET, {rise: 12, length: .18});
  drop(u2.agentEnter + .12, 0, 72, .45);
  for (let i = 0; i < 3; i++) bubble(mix, u2.firstThinking.at + i * .14, 72 + i * 3, .35, {...FX, pan: .2 - i * .2}, {rise: 7, length: .08});
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { wood(block.at, tone(block.at, 1, 79), .5, .25); continue; }
    const contour = [0, 1, 2, 1, 3, 2, 4, 3, 5, 4][step % 10];
    drop(block.at, contour, 67, .55 + .1 * (step % 2), (step % 2 ? .25 : -.25)); step++;
  }
  warning(u2.failure, 1.1);
  air(u2.upwardTurn, 500, 2200, .5, [0, .3]);
  air(u2.backtrack, 1800, 700, .45, [.4, -.4]);
  u2.drawers.forEach((time, i) => { wood(time, 67 + i * 5, .6, -.3 + i * .3); bubble(mix, time + .03, 70 + i * 4, .3, FX, {rise: 6}); });
  modal(mix, u2.highlight.at, tone(u2.highlight.at, 3, 79), .45, WET, GLASS);
  warning(u2.warning, 1);
  [0, 1, 2, 3].forEach(i => modal(mix, u2.insights + i * .07, tone(u2.insights, i, 69), .38, {...WET, pan: -.3 + i * .2}, VIBE, {name: 'insight'}));
  air(u2.zoom, 2400, 400, .55, [-.2, .2]);
  run(u2.collapse.at, Math.min(.5, u2.collapse.duration), 6, 6, -1, .3, KALIMBA);
  air(u2.cloudIn, 350, 1400, .5, [-.5, .3]);

  // Cost: the cheap models dart past, the powerful one lands heavy, the budget drips away.
  air(cost.cloudOut, 1200, 350, .45, [.3, -.4]);
  cost.cheapLegs.forEach((leg, i) => {
    const dir = i % 2 ? -1 : 1;
    glide(mix, leg.at, Math.max(.3, leg.duration), FX, {from: 900, to: 2600, level: .35, panFrom: -.7 * dir, panTo: .7 * dir, peak: .7, tone: [74, 81], toneLevel: .05});
    blip(mix, leg.at + leg.duration * .7, tone(leg.at, 1, 74), .3, {...FX, pan: .5 * dir}, {bend: 3});
  });
  for (let i = 0; i < 3; i++) warning(cost.thinkingDrop.at + i * .12, .55 - i * .1, -.4 + i * .4);
  air(cost.cameraToBash, 1600, 500, .45);
  bubble(mix, cost.bashEntry.at, 57, .6, FX, {rise: 10, length: .2});
  modal(mix, cost.bashStop, tone(cost.bashStop, 0, 43), .9, DRY, MARIMBA, {mallet: 500, malletLevel: .5, name: 'thud'});
  air({at: cost.bashExpand, duration: .35}, 700, 1900, .3);
  run(cost.bashDescent.at, cost.bashDescent.duration * .85, 7, 6, -1, .42);
  modal(mix, cost.bashHighlight.at, tone(cost.bashHighlight.at, 3, 79), .42, WET, GLASS);
  warning(cost.bashWarning, 1);
  air(cost.cameraToBudget, 1500, 450, .45);
  glide(mix, cost.smokeEnter, 1.2, FX, {from: 300, to: 700, level: .25, peak: .3});
  drop(cost.budgetAppear, 2, 72, .55);
  for (let t = cost.budgetRun.at; t < cost.depletion.at; t += .24) bubble(mix, t, tone(t, 1, 79), .18, {...FX, pan: .3}, {rise: 5, length: .06});
  // The budget drains in slowing, falling drops.
  for (let i = 0, t = cost.depletion.at; t < cost.depletion.at + cost.depletion.duration; i++, t += .14 * 1.18 ** i)
    bubble(mix, t, tone(t, Math.max(0, 6 - i), 62), .38 - i * .02, {...FX, pan: .3 - i * .06}, {rise: -6, length: .12});

  // Flow-1: the title splashes, beads drop into the chart, the engine spins.
  air(flow.entry, 400, 2600, .5);
  bubble(mix, flow.reveal - .02, 53, 1, WET, {rise: 19, length: .35});
  [0, 1, 2, 3, 4].forEach(i => drop(flow.reveal + i * .045, i, 65, .6 - i * .05, -.4 + i * .2));
  air(flow.cloudExit, 900, 300, .35, [0, .5]);
  air(flow.cameraZoom, 600, 2000, .35);
  wood(flow.benchmark, tone(flow.benchmark, 2, 76), .55);
  flow.numberDrops.forEach((time, i) => drop(time, i, 67, .55, -.5 + i * .2));
  const ticks = Math.max(4, Math.round(flow.countUp.duration / .09));
  for (let i = 0; i < ticks; i++) bubble(mix, flow.countUp.at + i * flow.countUp.duration / ticks, 74 + i * 12 / ticks, .15, {...FX, pan: -.2}, {rise: 4, length: .05});
  air(flow.cameraToAnalysis, 500, 2400, .45, [-.3, .3]);
  run(flow.cameraToAnalysis.at + .2, flow.cameraToAnalysis.duration * .7, 6, 0, 1, .32, KALIMBA);
  for (let i = 0; i < 5; i++) wood(flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 5, 84, .25, -.5 + i * .25);
  air(flow.cameraToEngine, 2000, 600, .45);
  [0, 2, 4].forEach((index, i) => modal(mix, flow.moduleActivation + i * .06, tone(flow.moduleActivation, index, 67), .45, WET, VIBE, {name: 'engine'}));
  for (let i = 0; i < 8; i++) bubble(mix, flow.engineSpinner.at + i * flow.engineSpinner.duration / 8, 79 + (i % 4) * 2, .17, {...FX, pan: Math.sin(i * Math.PI / 2) * .6}, {rise: 6, length: .05});
  air(flow.cover, 2200, 500, .4);
  modal(mix, flow.coverShut, tone(flow.coverShut, 0, 41), .8, DRY, MARIMBA, {mallet: 500, name: 'thud'});
  wood(flow.coverShut, 72, .35);
  modal(mix, flow.coverTint.at, tone(flow.coverTint.at, 4, 79), .35, WET, GLASS);

  // Issues: Signals reads the trace, writes its report, then the issues bubble up and gather.
  const {prelude} = issues;
  bubble(mix, prelude.bashEntry.at, 60, .55, FX, {rise: 10, length: .18});
  modal(mix, prelude.bashStop, tone(prelude.bashStop, 0, 43), .75, DRY, MARIMBA, {mallet: 500, name: 'thud'});
  run(prelude.descent.at, prelude.descent.duration * .85, 6, 5, -1, .36);
  modal(mix, prelude.highlight, tone(prelude.highlight, 3, 79), .4, WET, GLASS);
  if (prelude.bubble !== undefined) { bubble(mix, prelude.bubble, 60, .8, WET, {rise: 14, length: .3}); drop(prelude.bubble + .08, 2, 72, .4); }
  if (prelude.labels) [0, 1, 2].forEach(i => drop(prelude.labels!.at + i * prelude.labels!.duration / 3, i + 1, 72, .45, -.3 + i * .3));
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .085 + .03 * ((i * 7) % 3), i++)
    wood(t, 86 + (i % 3) * 3, .12 + .05 * ((i * 5) % 2), .15);
  if (prelude.bubbleExit !== undefined) bubble(mix, prelude.bubbleExit, 72, .5, FX, {rise: -10, length: .22});
  air(prelude.zoomOut, 2400, 500, .5);
  run(prelude.collapse, .4, 5, 5, -1, .25, KALIMBA);
  glide(mix, prelude.circleGrow.at, prelude.circleGrow.duration, FX, {from: 300, to: 1600, level: .35, peak: .8});
  for (const pop of radialPops(cues)) bubble(mix, pop.at, tone(pop.at, Math.round(pop.height * 5), 67), .32, {...FX, pan: pop.pan}, {rise: 8, length: .07});
  air(issues.travel, 500, 1800, .35, [-.3, .3]);
  issues.clusters.forEach((time, i) => drop(time, i % 5, 70, .5, -.5 + (i % 5) * .25));
  air(issues.windowDown, 1600, 500, .4);
  wood(issues.windowShut, 64, .6);
  for (const [i, event] of issues.typingEvents.entries()) wood(event.time, 81 + [0, 3, 5, 2][i % 4], .28, -.1 + (i % 3) * .1);
  warning(issues.issueBadge, .8, .3);
  glide(mix, issues.messageSend, .4, FX, {from: 800, to: 3200, level: .35, peak: .6, panFrom: 0, panTo: .4});
  bubble(mix, issues.messageSend + .05, 70, .5, WET, {rise: 12, length: .15});
  warning(issues.queryBadge, .6, .3);
  air(issues.windowUp, 500, 1600, .4);

  // Conclusion: the camera pulls back over the field; the logo bloom lives in the music.
  glide(mix, conclusion.start, 3.5, FX, {from: 1800, to: 400, level: .35, peak: .25});
  bubble(mix, conclusion.logo - .03, 53, .8, WET, {rise: 24, length: .4});
}
