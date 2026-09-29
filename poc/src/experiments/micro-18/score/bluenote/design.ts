import type {ScoreCues} from '../cues';
import {VIBE, brush, chordAt, modal, radialPops, toneOf} from '../rounded';
import {rim} from '../lofi/instruments';
import {kick, piano, snare, type Mix, type Route} from '../voices';
import {bluenotePlan} from './composition';
import {cymbal, cymbalSwell, horn, section, tom} from './instruments';

/*
 * Bluenote foley: the band plays the picture. Moves are cymbal swells with a vibes run, arrivals are
 * rimshots and toms, and the small things are vibes and piano notes in the chord. Tier 1 is brass:
 * warnings are a muted trumpet "wah-wah", the failure is a trombone blat under a crash, and the
 * budget dies on a sad plunger trombone.
 */

const FX: Route = {bus: 'sfx', room: .35, hall: .12};
const WET: Route = {bus: 'sfx', room: .3, hall: .3, delay: .1};
const DRY: Route = {bus: 'sfx', room: .25};

export function bluenoteDucks(mix: Mix, cues: ScoreCues) {
  const {ultimate2: u2, cost, issues} = cues;
  for (const time of [u2.warning, cost.bashWarning, issues.issueBadge]) mix.duck(time, .55, .02, .35, .5);
  mix.duck(cost.thinkingDrop.at, .6, .02, .5, .5);
  mix.duck(cost.depletion.at + .75, .35, .1, 1.6, .4);
}

export function designBluenote(mix: Mix, cues: ScoreCues) {
  const plan = bluenotePlan(cues), {ultimate2: u2, cost, flow, issues, conclusion} = cues;
  const tone = (time: number, index: number, floor: number) => toneOf(chordAt(plan, time), index, floor);
  const vibe = (time: number, index: number, floor: number, velocity: number, pan = 0) =>
    modal(mix, time, tone(time, index, floor), velocity, {...WET, pan}, VIBE, {mallet: 3400, malletLevel: .3, name: 'vibes'});
  const plink = (time: number, index: number, floor: number, velocity: number) => piano(mix, time, tone(time, index, floor), velocity, WET, {length: .8, bright: .75});
  /** A run through the chord across `duration`: up or down, on vibes. */
  const run = (start: number, duration: number, count: number, up: boolean, velocity: number, floor = 65) => {
    for (let i = 0; i < count; i++) vibe(start + duration * i / Math.max(1, count - 1), up ? i : count - 1 - i, floor, velocity * (.75 + .25 * i / count), (i / Math.max(1, count - 1) - .5) * (up ? .8 : -.8));
  };
  const move = (span: {at: number; duration: number}, up: boolean, level: number) => {
    const duration = Math.max(.35, span.duration);
    cymbalSwell(mix, span.at, span.at + duration * .8, .35 * level, {...FX, pan: up ? .3 : -.3}, {ring: .5});
    brush(mix, span.at, .35 * level, {...FX, pan: up ? -.2 : .2}, {length: duration, hz: 2600, attack: duration * .6});
    run(span.at + duration * .15, duration * .6, Math.max(4, Math.round(duration * 7)), up, .38 * level);
  };
  const warning = (time: number, level = 1, pan = 0) => {
    const high = tone(time, 3, 70), low = tone(time, 1, 64);
    horn(mix, time, high, .16, .7 * level, {...DRY, pan}, {kind: 'trumpet', wah: 7, scoop: .3});
    horn(mix, time + .2, low, .32, .7 * level, {...DRY, pan}, {kind: 'trumpet', wah: 3.5, fall: 1.5});
    rim(mix, time, .55 * level, {...DRY, pan});
  };
  const ba_dum = (time: number, level: number) => { tom(mix, time, 45, .6 * level, FX); kick(mix, time + .15, .7 * level, FX); cymbal(mix, time + .15, 'crash', .35 * level, {...FX, pan: .3}, {decay: .9}); };

  // Ultimate2: the agent sits in with the band.
  cymbalSwell(mix, 0, .35, .4, {...FX, pan: .2}, {ring: 1});
  rim(mix, u2.firstThinking.at, .4, DRY);
  let step = 0;
  for (const block of u2.blocks) {
    if (block.icon) { rim(mix, block.at, .45, {...DRY, pan: .3}); continue; }
    vibe(block.at, [0, 2, 1, 3, 2, 4, 3, 5, 4, 6][step % 10], 65, .6, step % 2 ? .3 : -.3); step++;
  }
  // The failure: a crash and a trombone blat that sags.
  cymbal(mix, u2.failure, 'crash', .7, {...FX, pan: -.35}, {decay: 1.6});
  horn(mix, u2.failure, tone(u2.failure, 0, 40), .55, .95, {...DRY, pan: -.1}, {kind: 'bone', fall: 4, scoop: 1});
  horn(mix, u2.failure + .01, tone(u2.failure, 1, 46), .55, .8, {...DRY, pan: .15}, {kind: 'bone', fall: 4, scoop: 1});
  move(u2.upwardTurn, true, .9);
  move(u2.backtrack, false, .9);
  u2.drawers.forEach((time, i) => { tom(mix, time, 43 + i * 4, .5, {...FX, pan: -.3 + i * .3}); vibe(time + .02, i * 2, 65, .4, -.3 + i * .3); });
  vibe(u2.highlight.at, 4, 72, .5);
  warning(u2.warning, 1);
  run(u2.insights, .45, 6, true, .45, 60);
  move(u2.zoom, false, 1);
  for (let i = 0; i < 7; i++) plink(u2.collapse.at + i * Math.min(.5, u2.collapse.duration) / 7, 6 - i, 60, .35);
  move(u2.cloudIn, true, .9);

  // Cost: cheap models tiptoe on high piano; the powerful one lands with a drum bomb.
  move(cost.cloudOut, false, .8);
  cost.cheapLegs.forEach((leg, i) => { for (let k = 0; k < 4; k++) plink(leg.at + k * leg.duration / 4, (i % 2 ? 3 - k : k) + 2, 79, .3); });
  for (let i = 0; i < 3; i++) warning(cost.thinkingDrop.at + i * .42, .75 - i * .12, -.4 + i * .4);
  move(cost.cameraToBash, false, .85);
  tom(mix, cost.bashEntry.at, 50, .5, FX);
  snare(mix, cost.bashStop, .6, FX, .7);
  rim(mix, cost.bashExpand, .45, DRY);
  run(cost.bashDescent.at, cost.bashDescent.duration * .85, 8, false, .4, 60);
  vibe(cost.bashHighlight.at, 4, 72, .45);
  warning(cost.bashWarning, 1);
  move(cost.cameraToBudget, false, .8);
  cymbalSwell(mix, cost.smokeEnter, cost.smokeEnter + .8, .25, {...FX, pan: -.2}, {ring: .6});
  rim(mix, cost.budgetAppear, .45, DRY); vibe(cost.budgetAppear + .02, 2, 72, .45);
  for (let t = cost.budgetRun.at; t < cost.depletion.at; t += .19) cymbal(mix, t, 'hat', .3, {...DRY, pan: .35}, {decay: .025});
  // The sad trombone: four plunger steps down the chromatic, the last one wobbling out.
  // It waits for the line over the depletion to finish.
  const line = cues.voice.find(span => span.at < cost.depletion.at + 1 && span.at + span.duration > cost.depletion.at);
  const sadStart = Math.max(cost.depletion.at + .75, line ? line.at + line.duration : 0);
  [57, 56, 55].forEach((midi, i) => horn(mix, sadStart + i * .3, midi, .26, .8, {...DRY, pan: .1}, {kind: 'bone', wah: 3.4, scoop: .5}));
  horn(mix, sadStart + .9, 54, .75, .85, {...DRY, pan: .1}, {kind: 'bone', wah: 6.5, vibrato: 1.4, fall: 1});

  // Flow-1: the band's own fill carries the drop; the foley rides the camera.
  cymbalSwell(mix, flow.entry.at, flow.reveal, .3, {...FX, pan: -.3}, {ring: .3});
  run(flow.reveal + .05, .3, 5, true, .5, 67);
  move(flow.cloudExit, false, .7);
  move(flow.cameraZoom, true, .7);
  rim(mix, flow.benchmark, .5, DRY);
  flow.numberDrops.forEach((time, i) => plink(time, 5 - i, 67, .45));
  const ticks = Math.max(4, Math.round(flow.countUp.duration / .07));
  for (let i = 0; i < ticks; i++) cymbal(mix, flow.countUp.at + i * flow.countUp.duration / ticks, 'hat', .25 + .2 * i / ticks, {...DRY, pan: -.2}, {decay: .02});
  // The analysis move is a trumpet rip up into the new number.
  horn(mix, flow.cameraToAnalysis.at + .2, tone(flow.cameraToAnalysis.at, 4, 72), .5, .75, {...FX, pan: .2}, {kind: 'trumpet', rip: 9, fall: 2});
  move(flow.cameraToAnalysis, true, .7);
  for (let i = 0; i < 5; i++) rim(mix, flow.analysisCountUp.at + i * flow.analysisCountUp.duration / 5, .3, {...DRY, pan: -.5 + i * .25});
  [0, 1, 2, 3].forEach(i => tom(mix, flow.cameraToEngine.at + i * .12, [50, 47, 45, 41][i], .45, {...FX, pan: .4 - i * .25}));
  [0, 2, 4].forEach((index, i) => vibe(flow.moduleActivation + i * .07, index, 65, .45));
  for (let i = 0; i < 10; i++) cymbal(mix, flow.engineSpinner.at + i * flow.engineSpinner.duration / 10, 'bell', .2, {...DRY, pan: Math.sin(i) * .5}, {decay: .25});
  brush(mix, flow.cover.at, .45, FX, {length: flow.cover.duration + .1, hz: 2400, attack: flow.cover.duration * .8});
  vibe(flow.coverTint.at, 4, 72, .4);

  // Issues: Signals reads the trace and writes the report.
  const {prelude} = issues;
  tom(mix, prelude.bashEntry.at, 50, .45, FX);
  snare(mix, prelude.bashStop, .5, FX, .7);
  run(prelude.descent.at, prelude.descent.duration * .85, 7, false, .38, 60);
  vibe(prelude.highlight, 4, 72, .42);
  if (prelude.bubble !== undefined) horn(mix, prelude.bubble, tone(prelude.bubble, 2, 67), .3, .5, {...FX, pan: .2}, {kind: 'alto', rip: 5});
  if (prelude.labels) [0, 1, 2].forEach(i => { const time = prelude.labels!.at + i * prelude.labels!.duration / 3; chordAt(plan, time).pad.forEach(midi => piano(mix, time, midi + 12, .32, FX, {length: .35})); });
  if (prelude.explanation) for (let t = prelude.explanation.at, i = 0; t < prelude.explanation.at + prelude.explanation.duration; t += .08 + .03 * ((i * 7) % 3), i++)
    cymbal(mix, t, 'hat', .2 + .06 * ((i * 5) % 2), {...DRY, pan: .15}, {decay: .018});
  if (prelude.explanation) vibe(prelude.explanation.at + prelude.explanation.duration, 4, 72, .4);
  if (prelude.bubbleExit !== undefined) brush(mix, prelude.bubbleExit, .4, FX, {length: .4, hz: 2600, attack: .25});
  move(prelude.zoomOut, false, .9);
  for (let i = 0; i < 6; i++) plink(prelude.collapse + i * .07, 5 - i, 60, .3);
  cymbalSwell(mix, prelude.circleGrow.at, prelude.circleGrow.at + prelude.circleGrow.duration, .35, {...FX, pan: .2}, {ring: .8});
  for (const pop of radialPops(cues)) modal(mix, pop.at, tone(pop.at, Math.round(pop.height * 6), 70), .22, {...WET, pan: pop.pan}, VIBE, {mallet: 4000, malletLevel: .2, length: .9, name: 'vibes'});
  move(issues.travel, true, .7);
  // The clusters lock: a section stab.
  section(mix, issues.clusters[0], chordAt(plan, issues.clusters[0]).pad.map(midi => midi + 12), .2, .7, FX, {});
  issues.clusters.forEach((time, i) => vibe(time + .03, i % 5, 67, .35, -.5 + (i % 5) * .25));
  move(issues.windowDown, false, .7);
  ba_dum(issues.windowShut, .7);
  for (const [i, event] of issues.typingEvents.entries()) cymbal(mix, event.time, 'hat', .35, {...DRY, pan: -.1 + (i % 3) * .1}, {decay: .02});
  warning(issues.issueBadge, .8, .3);
  horn(mix, issues.messageSend, tone(issues.messageSend, 4, 72), .4, .7, {...FX, pan: .3}, {kind: 'trumpet', rip: 7, fall: 3});
  warning(issues.queryBadge, .6, .3);
  move(issues.windowUp, true, .7);

  // Conclusion: the camera pulls back on a long cymbal swell and a falling piano run.
  cymbalSwell(mix, conclusion.start, conclusion.start + 2.5, .3, {...FX, pan: -.2}, {ring: 1});
  for (let i = 0; i < 10; i++) plink(conclusion.start + .3 + i * .16, 9 - i, 60, .3);
}
