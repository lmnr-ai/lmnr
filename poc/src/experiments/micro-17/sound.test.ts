import assert from 'node:assert/strict';
import {agentWindowSoundEventsBetween, cameraMoveEventsBetween, cloudWhooshEventsBetween, dotTwinkleEventsBetween, drawerOpeningEventsBetween, flowDoorSoundEventsBetween, flowRatchetEventsBetween, flowRevealEventsBetween, micro17CloudInWindow, numberDropEventsBetween, openingCloudPuffEventsBetween, streamRunAudioEventsBetween, streamRunAudioStateAt} from './stream-run-sound';
import {DEFAULT_TIMING, normalizeTiming} from './timeline';

const streamRun = {at: 1.9, duration: 6.9};
assert.deepEqual(streamRunAudioEventsBetween(1.8, 3, streamRun), [
  {kind: 'tick', time: 2},
  {kind: 'puff', time: 2.25},
  {kind: 'tick', time: 2.35},
  {kind: 'tick', time: 2.7},
  {kind: 'puff', time: 2.95},
], 'Animation 10 ticks and puffs begin relative to the authored stream run');
assert.deepEqual(streamRunAudioEventsBetween(8.8, 10, streamRun), [
  {kind: 'tick', time: 9},
  {kind: 'puff', time: 9.25},
  {kind: 'tick', time: 9.35},
  {kind: 'tick', time: 9.7},
  {kind: 'puff', time: 9.95},
], 'ticks and puffs retain their cadence during the audible fade tail');
const fullTail = streamRunAudioEventsBetween(8.8, 11.8, streamRun);
assert.deepEqual([
  ...streamRunAudioEventsBetween(8.8, 9.6, streamRun),
  ...streamRunAudioEventsBetween(9.6, 10.7, streamRun),
  ...streamRunAudioEventsBetween(10.7, 11.8, streamRun),
], fullTail, 'partitioned playback emits exactly the same tail events as one continuous window');
assert.deepEqual(streamRunAudioEventsBetween(10, 9, streamRun), [], 'rewinds do not replay tail events');
assert.deepEqual(streamRunAudioEventsBetween(3.9, 5, {at: 4, duration: 1}), [
  {kind: 'tick', time: 4.1},
  {kind: 'puff', time: 4.35},
  {kind: 'tick', time: 4.45},
  {kind: 'tick', time: 4.8},
], 'retiming streamRun moves and clips its sound window without copied timestamps');
assert.deepEqual(streamRunAudioEventsBetween(1.8, 3, streamRun, undefined, .2), [
  {kind: 'tick', time: 2},
  {kind: 'puff', time: 2.1},
  {kind: 'tick', time: 2.35},
  {kind: 'tick', time: 2.7},
  {kind: 'puff', time: 2.8},
], 'puff offset shifts only the puff phase while preserving its .7 second period');
assert.deepEqual(cameraMoveEventsBetween(13, 15, [{at: 14.3, duration: 2}, {at: 23.21, duration: 1.58}]), [
  {kind: 'cameraMove', time: 14.3, duration: 2},
], 'camera effects trigger at movement starts and retain each visual bar duration');
assert.deepEqual(cameraMoveEventsBetween(15, 13, [{at: 14.3, duration: 2}]), [], 'reverse seeks do not trigger camera effects');
assert.deepEqual(flowRevealEventsBetween(33.6, 33.8, {at: 33.7, duration: 2.13}), [
  {kind: 'flowReveal', time: 33.7, duration: 2.13},
], 'the Flow harmony begins once as playback enters its chapter');
assert.deepEqual(flowRevealEventsBetween(34, 33, {at: 33.7, duration: 2.13}), [], 'reverse seeks do not retrigger the Flow harmony');
const twinkles = [{at: 35.15, noteIndex: 1, pan: -.4, gain: .6}];
assert.deepEqual(dotTwinkleEventsBetween(35, 35.2, twinkles), [
  {...twinkles[0], kind: 'dotTwinkleShimmer'},
]);
assert.deepEqual(dotTwinkleEventsBetween(35.2, 35, twinkles), [], 'reverse seeks do not retrigger twinkles');
assert.deepEqual(flowRatchetEventsBetween(41.2, 41.9, {at: 41.32, duration: .56}, .15), [
  {kind: 'flowRatchet', time: 41.32},
  {kind: 'flowRatchet', time: 41.47},
  {kind: 'flowRatchet', time: 41.62},
  {kind: 'flowRatchet', time: 41.77},
], 'Flow bar growth emits the existing tick recipe at the tunable ratchet interval');
assert.deepEqual(flowRatchetEventsBetween(41.47, 41.9, {at: 41.32, duration: .56}, .15), [
  {kind: 'flowRatchet', time: 41.62},
  {kind: 'flowRatchet', time: 41.77},
], 'the previous frame is exclusive and the visual endpoint clips the ratchet');
assert.deepEqual(flowRatchetEventsBetween(41.2, 41.9, {at: 41.32, duration: .56}, .2), [
  {kind: 'flowRatchet', time: 41.32},
  {kind: 'flowRatchet', time: 41.52},
  {kind: 'flowRatchet', time: 41.72},
], 'a larger interval produces a lower tick frequency without changing the visual window');
assert.deepEqual(flowRatchetEventsBetween(42, 41, {at: 41.32, duration: .56}, .15), [], 'reverse seeks never replay Flow ratchet ticks');
const numberDrops = [41.01, 41.06, 41.11, 41.16, 41.21, 41.26];
assert.deepEqual(numberDropEventsBetween(41, 41.12, numberDrops), [
  {kind: 'numberDropPiano', time: 41.01}, {kind: 'numberDropPiano', time: 41.06}, {kind: 'numberDropPiano', time: 41.11},
], 'each crossed staggered card boundary emits exactly one piano note');
assert.deepEqual(numberDropEventsBetween(41.11, 41.22, numberDrops), [
  {kind: 'numberDropPiano', time: 41.16}, {kind: 'numberDropPiano', time: 41.21},
], 'the previous frame is exclusive, preventing duplicate notes');
assert.deepEqual(numberDropEventsBetween(42, 41, numberDrops), [], 'reverse seeks do not replay number drops');
const drawers = [11.1, 11.6, 12.1, 21.65, 24.93];
assert.deepEqual(drawerOpeningEventsBetween(10, 11.65, drawers, 'bubblePair'), [
  {kind: 'drawerBubble', time: 11.1}, {kind: 'drawerBubble', time: 11.6},
], 'drawer cues trigger once when playback crosses each opening');
assert.deepEqual(drawerOpeningEventsBetween(12.2, 25, drawers, 'whistleWhoosh'), [
  {kind: 'drawerWhoosh', time: 21.65}, {kind: 'drawerWhoosh', time: 24.93},
], 'the selected drawer effect applies to Ultimate 2 and Cost cues');
assert.deepEqual(drawerOpeningEventsBetween(12.1, 11, drawers, 'bubblePair'), [], 'reverse seeks do not trigger drawers');
assert.deepEqual(streamRunAudioStateAt(8.7, streamRun), {phase: 'active', gain: 1});
assert.deepEqual(streamRunAudioStateAt(8.8, streamRun), {phase: 'fading', gain: 1});
assert.deepEqual(streamRunAudioStateAt(10.3, streamRun), {phase: 'fading', gain: .5});
assert.deepEqual(streamRunAudioStateAt(11.8, streamRun), {phase: 'silent', gain: 0});
assert.deepEqual(streamRunAudioEventsBetween(11.7, 12, streamRun), [], 'the fade tail ends without residual cadence');
assert.deepEqual(streamRunAudioEventsBetween(0, 20, {at: 4, duration: 0}), [], 'a zero-duration stream run stays silent');
assert.deepEqual(streamRunAudioStateAt(4, {at: 4, duration: 0}), {phase: 'silent', gain: 0});
assert.deepEqual(micro17CloudInWindow(DEFAULT_TIMING), {at: 12.618181818181819, duration: 1.4});
const retimedCloud = normalizeTiming({...DEFAULT_TIMING, cloudEnter: {...DEFAULT_TIMING.cloudEnter, at: 15.25, duration: 2.1}});
assert.deepEqual(micro17CloudInWindow(retimedCloud), {at: 15.25, duration: 2.1});
assert.deepEqual(cloudWhooshEventsBetween(15, 16, {cloudIn: micro17CloudInWindow(retimedCloud)}), [
  {kind: 'cloudIn', time: 15.25, duration: 2.1},
]);
assert.deepEqual(cloudWhooshEventsBetween(15.25, 16, {cloudIn: micro17CloudInWindow(retimedCloud)}), [], 'cue start uses an exclusive previous-time boundary');
assert.deepEqual(openingCloudPuffEventsBetween(0, 1, [.23, .33]), [
  {kind: 'cloudPuff', time: .23, duration: .64},
  {kind: 'cloudPuff', time: .33, duration: .64},
], 'the two opening clouds each receive a light puff 100ms apart');
const agentWindowSounds = {down: {at: 50.03, duration: .57}, thockAt: 50.45, up: {at: 52.54, duration: .57}};
assert.deepEqual(agentWindowSoundEventsBetween(49.9, 50.6, agentWindowSounds), [
  {kind: 'agentWindowDown', time: 50.03},
  {kind: 'agentWindowThock', time: 50.45},
]);
assert.deepEqual(agentWindowSoundEventsBetween(52.5, 52.6, agentWindowSounds), [
  {kind: 'agentWindowUp', time: 52.54},
]);
const flowDoorSounds = {slide: {at: 44.67, duration: .57}, thockAt: 45.11};
assert.deepEqual(flowDoorSoundEventsBetween(44.6, 45.2, flowDoorSounds), [
  {kind: 'flowDoorSlide', time: 44.67},
  {kind: 'flowDoorThock', time: 45.11},
]);
console.log('Stream-run, cloud, and drawer audio: authored timing, retiming, clipping, and fade passed.');
