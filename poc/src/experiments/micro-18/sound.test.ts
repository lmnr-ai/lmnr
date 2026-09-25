import assert from 'node:assert/strict';
import {ULTIMATE_3_DEFAULTS, normalizeSettings} from './settings';
import {ultimate3AgentWindowSoundTiming, ultimate3CameraMoveWindows, ultimate3CheapAgentWhooshWindows, ultimate3CloudWhooshWindows, ultimate3DrawerOpeningTimes, ultimate3FlowDoorSoundTiming, ultimate3FlowNumberDropTimes, ultimate3FlowRatchetWindow, ultimate3FlowRevealWindow, ultimate3FlowTwinkleCues, ultimate3OpeningCloudPuffTimes} from './sound';

assert.deepEqual(ultimate3OpeningCloudPuffTimes(ULTIMATE_3_DEFAULTS), [.23, .33],
  'light puffs follow the two opening clouds rather than the final cloud cover');
assert.deepEqual(ultimate3AgentWindowSoundTiming(ULTIMATE_3_DEFAULTS), {
  down: {at: 47.278181818, duration: .57}, thockAt: 47.698181818, up: {at: 49.638181818, duration: .57},
}, 'coding-agent slide follows its editable bars and lands with a 50ms perceptual offset');
assert.deepEqual(ultimate3FlowDoorSoundTiming(ULTIMATE_3_DEFAULTS), {
  slide: {at: 40.488181818, duration: .57}, thockAt: 40.928181818,
}, 'Flow door slide follows cover descent and clicks 50ms before the doors meet');
assert.deepEqual({...ultimate3FlowRevealWindow(ULTIMATE_3_DEFAULTS), at: Number(ultimate3FlowRevealWindow(ULTIMATE_3_DEFAULTS).at.toFixed(9))}, {at: 29.518181818, duration: 2.13},
  'Signal Garden begins at the authored Flow chapter boundary for its first harmonic span');
assert.deepEqual({...ultimate3FlowRevealWindow(ULTIMATE_3_DEFAULTS, 3.4), at: Number(ultimate3FlowRevealWindow(ULTIMATE_3_DEFAULTS, 3.4).at.toFixed(9))}, {at: 29.518181818, duration: 3.4},
  'the reveal window follows the independent time-to-peak and tail controls');
const twinkles = ultimate3FlowTwinkleCues(ULTIMATE_3_DEFAULTS, .8, 6, 7);
assert.deepEqual(twinkles, ultimate3FlowTwinkleCues(ULTIMATE_3_DEFAULTS, .8, 6, 7), 'random twinkle timing is deterministic');
assert.ok(twinkles.length > 0 && twinkles.every((cue, index) => cue.at >= 29.518181818 && cue.at < 36.318181818 && (index === 0 || cue.at > twinkles[index - 1].at)),
  'twinkles are individually scattered across the independent rise-and-tail envelope');
assert.ok(ultimate3FlowTwinkleCues(ULTIMATE_3_DEFAULTS, .8, 6, 14).length >= twinkles.length,
  'the density control monotonically admits more twinkles');
assert.ok(twinkles.at(-1)!.gain < Math.max(...twinkles.map(cue => cue.gain)) * .25,
  'the final sparse twinkles also fade to near silence');
assert.deepEqual(ultimate3FlowNumberDropTimes(ULTIMATE_3_DEFAULTS), [34.208181818, 34.258181818, 34.308181818, 34.358181818, 34.408181818, 34.458181818],
  'each Flow card gets one G5 piano cue at its initial staggered drop, not the later number swap');
const noNumberStagger = normalizeSettings({...ULTIMATE_3_DEFAULTS, flow: {...ULTIMATE_3_DEFAULTS.flow,
  controls: {...ULTIMATE_3_DEFAULTS.flow.controls, numberRowStagger: 0}}});
assert.deepEqual(ultimate3FlowNumberDropTimes(noNumberStagger), [34.208181818, 34.208181818, 34.208181818, 34.208181818, 34.208181818, 34.208181818],
  'the audio follows the row-stagger dial all the way back to simultaneous drops');
const defaultRatchet = ultimate3FlowRatchetWindow(ULTIMATE_3_DEFAULTS);
assert.deepEqual({at: Number(defaultRatchet.at.toFixed(2)), duration: defaultRatchet.duration}, {at: 37.14, duration: .56},
  'the ratchet window is derived from the Flow barsGrow clip and chapter offset');
assert.deepEqual(ultimate3CameraMoveWindows(ULTIMATE_3_DEFAULTS).map(window => ({
  at: Number(window.at.toFixed(2)), duration: Number(window.duration.toFixed(2)),
})), [
  {at: 10.12, duration: 2},
  {at: 19.03, duration: 1.58},
  {at: 23.52, duration: 1.3},
  {at: 29.52, duration: 1.2},
  {at: 32.83, duration: 1},
  {at: 32.85, duration: 1.2},
  {at: 36.82, duration: .51},
  {at: 39.36, duration: .66},
], 'camera whooshes follow Ultimate 2 zoom, Cost moves, Cost-to-Flow bridge, and every Flow camera bar');
assert.deepEqual(ultimate3CheapAgentWhooshWindows(ULTIMATE_3_DEFAULTS).map(window => ({
  at: Number(window.at.toFixed(2)), duration: Number(window.duration.toFixed(2)), direction: window.direction,
})), [
  {at: 15.92, duration: .4, direction: 'leftToRight'},
  {at: 16.41, duration: .4, direction: 'rightToLeft'},
  {at: 16.91, duration: .4, direction: 'leftToRight'},
], 'yellow-agent passes trigger matching left, right, left spatial whooshes');
assert.deepEqual(ultimate3DrawerOpeningTimes(ULTIMATE_3_DEFAULTS).map(time => Number(time.toFixed(9))), [6.918181818, 7.418181818, 7.918181818, 17.468181818, 20.748181818],
  'Ultimate 3 derives three Ultimate 2 and two Cost drawer cues from their visual clips');
const defaultClouds = ultimate3CloudWhooshWindows(ULTIMATE_3_DEFAULTS);
assert.deepEqual({
  cloudIn: {...defaultClouds.cloudIn!, at: Number(defaultClouds.cloudIn!.at.toFixed(9))},
  cloudOut: {...defaultClouds.cloudOut!, at: Number(defaultClouds.cloudOut!.at.toFixed(9))},
}, {
  cloudIn: {at: 12.618181818, duration: 1.4},
  cloudOut: {at: 14.968181818, duration: 3.26},
}, 'Ultimate 3 derives cloud cues from the Ultimate 2 and Cost clips');
const retimed = normalizeSettings({
  ...ULTIMATE_3_DEFAULTS,
  ultimate2: {...ULTIMATE_3_DEFAULTS.ultimate2, timing: {
    ...ULTIMATE_3_DEFAULTS.ultimate2.timing,
    cloudEnter: {...ULTIMATE_3_DEFAULTS.ultimate2.timing.cloudEnter, at: 15, duration: 2},
  }},
  cost: {...ULTIMATE_3_DEFAULTS.cost, timing: {
    ...ULTIMATE_3_DEFAULTS.cost.timing,
    cloudSweep: {...ULTIMATE_3_DEFAULTS.cost.timing.cloudSweep, at: .8, duration: 2.4},
  }},
});
assert.deepEqual(ultimate3DrawerOpeningTimes(retimed).map(time => Number(time.toFixed(9))), [6.918181818, 7.418181818, 7.918181818, 20.45, 23.73]);
const retimedDrawers = normalizeSettings({
  ...ULTIMATE_3_DEFAULTS,
  allocations: {...ULTIMATE_3_DEFAULTS.allocations, ultimate2: 20},
  ultimate2: {...ULTIMATE_3_DEFAULTS.ultimate2, timing: {
    ...ULTIMATE_3_DEFAULTS.ultimate2.timing,
    redThinkingLift: {...ULTIMATE_3_DEFAULTS.ultimate2.timing.redThinkingLift, at: 4},
    readLift: {...ULTIMATE_3_DEFAULTS.ultimate2.timing.readLift, at: 5},
    thinkingLift: {...ULTIMATE_3_DEFAULTS.ultimate2.timing.thinkingLift, at: 6},
  }},
  cost: {...ULTIMATE_3_DEFAULTS.cost, timing: {
    ...ULTIMATE_3_DEFAULTS.cost.timing,
    thinkingDrop: {...ULTIMATE_3_DEFAULTS.cost.timing.thinkingDrop, at: 1},
    bashExpand: {...ULTIMATE_3_DEFAULTS.cost.timing.bashExpand, at: 2},
  }},
});
assert.deepEqual(ultimate3DrawerOpeningTimes(retimedDrawers), [4, 5, 6, 21, 22],
  'drawer cues follow retimed visual clips and the Cost chapter global offset');
assert.deepEqual(ultimate3CloudWhooshWindows(retimed), {
  cloudIn: {at: 15, duration: 2},
  cloudOut: {at: 18.3, duration: 2.4},
}, 'retiming either visual cloud clip directly retimes and resizes its sound');
const retimedRatchet = normalizeSettings({
  ...ULTIMATE_3_DEFAULTS,
  flow: {...ULTIMATE_3_DEFAULTS.flow, entrySlide: {...ULTIMATE_3_DEFAULTS.flow.entrySlide, duration: 2}, timing: {
    ...ULTIMATE_3_DEFAULTS.flow.timing,
    barsGrow: {...ULTIMATE_3_DEFAULTS.flow.timing.barsGrow, at: 5, duration: 1.25},
  }},
});
const retimedRatchetWindow = ultimate3FlowRatchetWindow(retimedRatchet);
assert.deepEqual({at: Number(retimedRatchetWindow.at.toFixed(2)), duration: retimedRatchetWindow.duration}, {at: 36.52, duration: 1.25},
  'retiming the Flow entry or barsGrow clip automatically retimes the ratchet');
console.log('Ultimate 3 cloud audio windows follow source clips.');
