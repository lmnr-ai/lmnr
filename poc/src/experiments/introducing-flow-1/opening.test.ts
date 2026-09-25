import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {IntroducingFlow1Scene} from './Scene';
import {sampleIntroducingFlow1, liveIntroducingFlow1} from './sample';
import {introducingFlowState, sampleFlowDots} from './geometry';
import {interpolateCloudRects} from '../micro-09/geometry';
import {sampleSparkleGrid, SPARKLE_DEFAULTS} from '../micro-09/sparkle';
import {FLOW_CLIP_KEYS, INTRODUCING_FLOW_1_TIMELINE as clips} from './timeline';

const opening = renderToStaticMarkup(createElement(IntroducingFlow1Scene, {playback: sampleIntroducingFlow1(1.5)}));
assert.doesNotMatch(opening, /flow1-cloud-backing/, 'cloud reveal must not contain a sliding gray rectangle');
assert.match(opening, /data-colored="false"/, 'the opening includes gray dots, not an entirely blue field');
const stateAt = (time: number) => introducingFlowState(sampleIntroducingFlow1(time));
for (const time of [1.35, 1.5, 1.8, 2.1]) {
  const state = stateAt(time);
  assert.equal(state.cloudProgress, 1);
  assert.equal(state.cloudTranslateY, 0, 'clouds stay at the title through the hold');
  assert.equal(state.camera.y, 10, 'camera waits for cloud exit');
  assert.deepEqual(interpolateCloudRects(state.cloudProgress, 37, state.cloudTranslateY), interpolateCloudRects(1, 37));
}
assert.equal(stateAt(0).cloudProgress, 0);
assert.equal(stateAt(0).cloudTranslateY, 0);
assert.ok(stateAt(2.5).cloudTranslateY > 0 && stateAt(2.5).cloudTranslateY < 900);
assert.ok(stateAt(2.9).cloudTranslateY > 0 && stateAt(2.9).cloudTranslateY < 900);
assert.ok(Math.abs(stateAt(3.71).cloudTranslateY - 900) < 1e-9);
assert.ok(interpolateCloudRects(1, 37, stateAt(3.71).cloudTranslateY).every(rect => rect.y > 720));
assert.ok(clips.cameraToBenchmark.at < clips.cloudExit.at + clips.cloudExit.duration, 'tuned camera travel overlaps the longer cloud exit');
for (const time of [0, .5, 1.5, 2, 2.9]) {
  const dots = sampleFlowDots(time);
  const source = sampleSparkleGrid(time, 209, SPARKLE_DEFAULTS);
  assert.deepEqual(dots.map(dot => dot.colored), source.map(cell => cell.kind === 'triangle'));
  assert.ok(dots.filter(dot => !dot.colored).length > dots.length / 2, 'most dots remain gray');
  assert.ok(dots.some(dot => dot.colored), 'a minority of dots sparkle blue');
  assert.deepEqual(sampleFlowDots(time), dots, 'sampling is deterministic');
}
const dots = sampleFlowDots(1.5);
assert.deepEqual(dots[0], {...dots[0], row: -1, column: 0});
// Retiming the exit changes only its live progress; no hard-coded global exit clock.
const sampled = sampleIntroducingFlow1(1.8);
const live = {time: sampled.time, ...Object.fromEntries(FLOW_CLIP_KEYS.map(key => [key, {
  ...sampled.timing[key], current: {progress: sampled.progress[key]},
}]))} as Parameters<typeof liveIntroducingFlow1>[0];
const retimed = liveIntroducingFlow1({...live, cloudExit: {at: 1.4, duration: .8, current: {progress: .5}}});
assert.equal(introducingFlowState(retimed).cloudTranslateY, 450);
console.log('Animation 13 cloud hold/exit, no backing, Animation 9 dot defaults and retiming passed.');
