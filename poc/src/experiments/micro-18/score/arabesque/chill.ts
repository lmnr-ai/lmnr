import type {ScoreCues} from '../cues';
import {piano, type Mix, type Route} from '../voices';
import {figure, melody, rolled, type Chord, type Progression} from '../writing';

/*
 * The chill prelude: everything before Flow-1 rides one unbroken, quiet eighth-note rocking in E major
 * (I – IV – iii – IV, a bar each) so the picture never stops the pulse. Events answer as soft in-key
 * piano touches on top of it instead of changing the harmony, and the last bar leans on Bsus into the drop.
 */

const PIANO: Route = {bus: 'music', hall: .44, room: .04};
const CLOSE: Route = {bus: 'music', hall: .24, room: .08};
const ECHO: Route = {bus: 'music', hall: .36, delay: .32};

const E: Chord = {bass: 40, tones: [52, 59, 63, 66, 68, 71, 75, 78]};
const A: Chord = {bass: 45, tones: [52, 57, 61, 64, 68, 71, 73, 76]};
const Gsm: Chord = {bass: 44, tones: [51, 56, 59, 63, 66, 68, 71, 75]};
const Bsus: Chord = {bass: 47, tones: [54, 57, 61, 64, 66, 69, 73, 76]};
const LOOP = [E, A, Gsm, A];
/** Rocks through the middle of the voicing, never reaching the top: room for the VO and the accents. */
const ROCK = [1, 3, 5, 4, 2, 4, 6, 4];

export function composeChillPrelude(mix: Mix, cues: ScoreCues, g: (beat: number) => number, at: (time: number, division?: number) => number, drop: number) {
  const u2 = cues.ultimate2, cost = cues.cost;

  // ── You build agents: an E major 9 unfurls upward, one B left shimmering in the echo.
  [40, 47, 54, 56, 63, 66, 71].forEach((midi, i) => piano(mix, u2.agentEnter + .02 + i * .07, midi, .3 - i * .015, {...PIANO, pan: -.35 + i * .1}, {length: 4.5, bright: .42}));
  piano(mix, g(-6), 83, .26, {...ECHO, pan: .3}, {length: 3, bright: .5});

  // ── One bed from the first trace to Flow-1; bars count back from the drop so Bsus always lands last.
  const from = at(u2.stream.at);
  const bars: [number, Chord][] = [[drop - 4, Bsus]];
  for (let k = 2; drop - 4 * k > from - 4; k++) bars.unshift([drop - 4 * k, LOOP[(k + 2) % 4]]);
  const bed: Progression = bars.map(([b, chord], i) => [Math.max(from, b), i ? chord : E] as const);
  const powerful = at(cost.powerful, 1), budget = at(cost.cameraToBudget.at, 1);
  figure(mix, g, from, drop, bed, {step: .5, pattern: ROCK, route: PIANO, bright: .4, length: 1.2,
    velocity: b => Math.min(.19, .12 + .07 * (b - from) / 4) + (b > drop - 2 ? .05 * (b - drop + 2) : 0), bass: {velocity: .3, length: 4}});
  // The powerful model only adds weight: a low octave under the same chords.
  bed.forEach(([b, chord]) => b >= powerful && b < budget && piano(mix, g(b) + .004, chord.bass - 12, .26, {...PIANO, pan: -.3}, {length: 3.5, bright: .3}));

  // ── When your agent fails: a soft falling third, still in the key.
  piano(mix, u2.failure, 83, .24, {...ECHO, pan: .15}, {length: 1.6, bright: .45});
  piano(mix, u2.failure + .25, 80, .2, {...ECHO, pan: .05}, {length: 2, bright: .4});
  // The upward turn climbs three steps; the backtrack rewinds down the pentatonic.
  melody(mix, g, [0, 1, 2].map(i => [at(u2.upwardTurn.at) + i * .5, [71, 75, 78][i], 1] as const), {...CLOSE, pan: .1}, {velocity: .22, bright: .45});
  [92, 90, 87, 85, 83, 80, 78, 75, 73, 71].forEach((midi, i) => piano(mix, u2.backtrack.at + i * .045, midi, .2 - i * .01, {...CLOSE, pan: .35 - i * .07}, {length: .7, bright: .5}));
  u2.drawers.forEach((time, i) => piano(mix, time, [68, 71, 75][i], .26 + i * .03, {...ECHO, pan: -.2 + i * .2}, {length: 2.4, bright: .5}));
  piano(mix, u2.highlight.at, 76, .18, {...ECHO, pan: .25}, {length: 1.6, bright: .5});

  // ── The insights are hidden across thousands of traces: the theme, far above, then the zoom drifts up the pentatonic.
  const insights = at(u2.insights, 1);
  melody(mix, g, [[insights + 1, 80, 1], [insights + 2, 83, 1], [insights + 3, 90, 1.5], [insights + 4.5, 88, .5], [insights + 5, 87, 3]], {...PIANO, pan: .2}, {velocity: .28, bright: .5});
  const drift = [64, 68, 71, 73, 76, 80, 83, 85, 88];
  drift.forEach((midi, i) => piano(mix, u2.zoom.at + .4 + (u2.zoom.duration - .4) * i / drift.length, midi, .1 + i * .01, {...ECHO, pan: -.3 + i * .075}, {length: 1.2, bright: .45}));
  // If only someone could read them all: the theme's D♯, left hanging.
  piano(mix, u2.ifOnly + .1, 87, .22, {...ECHO, pan: .3}, {length: 3, bright: .5});

  // ── Cheap LLMs read traces: each quick pass is a flick of four high notes in its direction.
  cost.cheapLegs.forEach(leg => {
    const run = leg.direction === 'leftToRight' ? [83, 85, 88, 90] : [90, 88, 85, 83];
    run.forEach((midi, i) => piano(mix, leg.at + i * leg.duration / 4, midi, .15 + (i === 3 ? .04 : 0), {...CLOSE, pan: (leg.direction === 'leftToRight' ? -.4 : .4) * (1 - i / 1.5)}, {length: .3, bright: .7}));
  });
  // …but fail to find crucial issues: the flick droops a third.
  piano(mix, cost.missIssues + .1, 80, .2, {...ECHO, pan: 0}, {length: 1.2, bright: .45});
  piano(mix, cost.missIssues + .35, 76, .17, {...ECHO, pan: -.1}, {length: 1.6, bright: .4});
  // Powerful LLMs: the bash window lands with a low octave touch.
  rolled(mix, cost.bashStop, [28, 40], .3, PIANO, {length: 2.4, bright: .3, spread: .006});
  piano(mix, cost.budgetAppear, 88, .18, {...ECHO, pan: -.1}, {length: 1.4, bright: .5});

  // ── …but the costs are unsustainable: the theme sinks while the bed keeps going; until now, the pickup.
  const depletion = at(cost.depletion.at);
  melody(mix, g, [[depletion, 87, 1], [depletion + 1, 83, 1], [depletion + 2, 80, 1], [depletion + 3, 78, 2]], {...PIANO, pan: .2}, {velocity: .24, bright: .45});
  [64, 68, 71, 76, 80, 83, 88, 92].forEach((midi, i) => piano(mix, g(drop - 1) + i * .0625, midi, .16 + i * .025, {...ECHO, pan: -.4 + i * .11}, {length: 1.2, bright: .55}));
}
