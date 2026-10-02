import assert from 'node:assert/strict';
import {AGENT_WINDOW_SLIDE, AGENT_WINDOW_THOCK, CAMERA_MOVE_SAMPLE_VARIANTS, CLOUD_WHOOSH, CLOUD_WHOOSH_IN, DOT_TWINKLE_SHIMMER, DRAWER_BUBBLE_PAIR, DRAWER_WHISTLE_WHOOSH, FLOW_DOOR_THOCK, FLOW_NUMBER_DROP_PIANO, flowNumberDropFrequency, FLOW_REVEAL_PAD, LIGHT_CLOUD_PUFF, micro10AudioEventsBetween} from './sound';

assert.deepEqual(AGENT_WINDOW_THOCK, {
  wave: 'sine', startFreq: 1161, noise: 0, click: 1, body: .28, endFreq: 1073,
  duration: .08, attack: .004, bodyPitch: 60, bodyDecay: .145, filter: 8000,
  resonance: 1, distortion: 0, pan: 0, delay: 0, feedback: 0,
}, 'coding-agent landing preserves the supplied mid-thock recipe');
assert.deepEqual(FLOW_DOOR_THOCK, {
  wave: 'sine', startFreq: 1016, noise: .05, click: 1, body: .63, endFreq: 882,
  duration: .05, attack: .004, bodyPitch: 60, bodyDecay: .14, filter: 8000,
  resonance: 1, distortion: 0, pan: 0, delay: 0, feedback: 0,
}, 'Flow doors preserve the supplied noisy-thock recipe');
assert.deepEqual(AGENT_WINDOW_SLIDE, {
  noiseColor: 'pink', duration: .57, body: 0, filterMotion: 'sweep', startFreq: 1875,
  endFreq: 1254, resonance: 23.05, envelopeShape: 'swell', attack: .461,
  decayCurve: 6.2, gain: .505, peak: .85, sharpness: .7, distortion: 0,
  panStart: .01, panEnd: 0, delay: .03,
}, 'coding-agent movement preserves the supplied slide-down recipe');

assert.deepEqual(FLOW_NUMBER_DROP_PIANO, {
  root: 783.99, velocity: .4, detune: -1.3, hardness: .85, hammer: .06,
  attack: .004, decay: .3, brightness: 0, spread: .01, width: .04,
  reverb: .34, volume: .09,
}, 'each Flow number drop preserves the supplied G5 piano recipe exactly');
assert.equal(flowNumberDropFrequency(79), 783.99, 'G5 keeps the supplied recipe root exactly');
assert.ok(Math.abs(flowNumberDropFrequency(81) - 879.999) < .001, 'the base-note dial transposes the supplied recipe chromatically');
assert.deepEqual(DOT_TWINKLE_SHIMMER.intervals, [0, 4, 7], 'twinkles vary from the selected base note using a major triad');
assert.deepEqual(FLOW_REVEAL_PAD, {
  notes: [48, 55, 59, 62, 66], gain: .024, wave: 'sine', timeToPeak: .32, tail: 1.81,
}, 'Flow reveal preserves Signal Garden Harmonic section 1 with independently shaped rise and tail');
assert.deepEqual(CAMERA_MOVE_SAMPLE_VARIANTS.map(variant => variant.duration),
  [.51, .66, 1, 1.2, 1.3, 1.58, 2],
  'every current camera-bar duration has a pitch-preserving deep-camera-whoosh render');
assert.deepEqual(LIGHT_CLOUD_PUFF, {
  noiseColor: 'pink', duration: .64, body: .27, filterMotion: 'sweep', startFreq: 1296,
  endFreq: 628, resonance: 5.25, envelopeShape: 'puff', attack: .045, decayCurve: 5.8,
  gain: .16, peak: .09, sharpness: .8, distortion: 0, panStart: -.05, panEnd: .05, delay: .02,
}, 'opening clouds preserve the supplied light-puff Signal Lab recipe');
assert.equal(CLOUD_WHOOSH_IN.noiseColor, 'brown', 'the later full cloud-cover entrance retains its prior whoosh');
assert.deepEqual(
  {body: CLOUD_WHOOSH.body, resonance: CLOUD_WHOOSH.resonance, startFreq: CLOUD_WHOOSH.startFreq, endFreq: CLOUD_WHOOSH.endFreq},
  {body: .03, resonance: 5.85, startFreq: 773, endFreq: 455},
  'cloud exit keeps its existing whoosh recipe');
assert.deepEqual(DRAWER_BUBBLE_PAIR.map(({startFreq, endFreq, duration, attack, pan, offset}) =>
  ({startFreq, endFreq, duration, attack, pan, offset})), [
  {startFreq: 319, endFreq: 284, duration: .17, attack: .015, pan: .35, offset: 0},
  {startFreq: 391, endFreq: 327, duration: .17, attack: .015, pan: .35, offset: .1},
], 'the default drawer effect is the two supplied bubbles 100ms apart');
assert.deepEqual(DRAWER_WHISTLE_WHOOSH, {
  noiseColor: 'brown', duration: .25, body: .02, filterMotion: 'sweep', startFreq: 459,
  endFreq: 1053, resonance: 4.3, envelopeShape: 'swell', attack: .393, decayCurve: 6,
  gain: .505, peak: .24, sharpness: .7, distortion: 0, panStart: .18, panEnd: .13, delay: .03,
}, 'the alternate drawer effect preserves the supplied Signal Lab recipe');

const timing = {duration: 12, puffOffset: .35, puffInterval: .7, tickOffset: .2, tickInterval: .5};
assert.deepEqual(micro10AudioEventsBetween(0, 2.2, timing), [
  {kind: 'tick', time: .2},
  {kind: 'puff', time: .35},
  {kind: 'tick', time: .7},
  {kind: 'puff', time: 1.05},
  {kind: 'tick', time: 1.2},
  {kind: 'tick', time: 1.7},
  {kind: 'puff', time: 1.75},
  {kind: 'tick', time: 2.2},
], 'every visual puff emission and repeating DialKit tick boundary produces one sound event');
assert.deepEqual(micro10AudioEventsBetween(.35, 1.05, timing), [
  {kind: 'tick', time: .7},
  {kind: 'puff', time: 1.05},
], 'the previous boundary is exclusive so rendered frames cannot retrigger a sound');
assert.deepEqual(micro10AudioEventsBetween(11.8, 12, timing), [], 'events never extend beyond the authored timeline');
assert.deepEqual(micro10AudioEventsBetween(0, 2, {...timing, puffOffset: .1, puffInterval: .8, tickOffset: .4, tickInterval: .8}), [
  {kind: 'puff', time: .1},
  {kind: 'tick', time: .4},
  {kind: 'puff', time: .9},
  {kind: 'tick', time: 1.2},
  {kind: 'puff', time: 1.7},
  {kind: 'tick', time: 2},
], 'both repeating DialKit bars independently control their offset and interval');
assert.deepEqual(micro10AudioEventsBetween(0, 2, {...timing, tickOffset: .4, tickInterval: .8}), [
  {kind: 'puff', time: .35},
  {kind: 'tick', time: .4},
  {kind: 'puff', time: 1.05},
  {kind: 'tick', time: 1.2},
  {kind: 'puff', time: 1.75},
  {kind: 'tick', time: 2},
], 'the tick bar remains independent from the puff bar');
console.log('Micro10 audio: visual puff boundaries and tunable repeating tick boundaries passed.');
