import assert from 'node:assert/strict';
import test from 'node:test';
import {Children, isValidElement} from 'react';
import {DitherClouds, type CloudState} from '../micro-09/DitherClouds';
import {interpolateCloudRects} from '../micro-09/geometry';
import {worldState} from '../micro-17/geometry';
import {Ultimate3Scene} from './Scene';
import {sampleUltimate3} from './sample';
import {VOICEOVER_DEFAULTS} from './voiceover-cut';
import {ULTIMATE_3_DEFAULTS, type Ultimate3Settings} from './settings';

function renderedClouds(time: number, settings: Ultimate3Settings): CloudState {
  const scene = Ultimate3Scene({sample: sampleUltimate3(time, settings), settings});
  const clouds = Children.toArray(scene.props.children).find(child => isValidElement(child) && child.type === DitherClouds);
  assert.ok(isValidElement(clouds));
  return clouds.props as CloudState;
}

test('current cloud entry starts fully below the frame, not already visible in its corners', () => {
  const settings = VOICEOVER_DEFAULTS;
  const entry = settings.ultimate2.timing.cloudEnter;
  // Subpixel easing progress is intentionally clamped to zero before mounting;
  // inspect the first rendered frames rather than requiring a canvas at that instant.
  for (const time of [entry.at + 1 / 60, entry.at + 1 / 30]) {
    const cloud = renderedClouds(time, settings);
    const rects = interpolateCloudRects(cloud.progress, cloud.yOffset, cloud.translateY, cloud.translateX);
    for (const rect of rects) assert.ok(rect.y >= 800, `cloud top ${rect.y} should start below the 720px frame with clearance`);
  }
});

test('extra entry clearance converges to the exact original settled cloud pose', () => {
  const settings = VOICEOVER_DEFAULTS;
  const entry = settings.ultimate2.timing.cloudEnter;
  const time = entry.at + entry.duration;
  const state = worldState(sampleUltimate3(time, settings).ultimate2!, settings.ultimate2.controls, settings.ultimate2.streamBlocksRemoved);
  assert.deepEqual(renderedClouds(time, settings), {progress: state.cloudProgress, yOffset: 27,
    translateY: state.cloudTranslateY, translateX: state.cloudTranslateX});
});

test('original cut keeps its original cloud entry trajectory', () => {
  const settings = ULTIMATE_3_DEFAULTS;
  const entry = settings.ultimate2.timing.cloudEnter;
  const time = entry.at + entry.duration / 2;
  const state = worldState(sampleUltimate3(time, settings).ultimate2!, settings.ultimate2.controls, settings.ultimate2.streamBlocksRemoved);
  assert.deepEqual(renderedClouds(time, settings), {progress: state.cloudProgress, yOffset: 27,
    translateY: state.cloudTranslateY, translateX: state.cloudTranslateX});
});
