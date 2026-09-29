import assert from 'node:assert/strict';
import test from 'node:test';
import {Children, createElement, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DitherClouds} from '../micro-09/DitherClouds';
import {worldState} from '../micro-17/geometry';
import {Ultimate3Scene} from './Scene';
import {chapterSchedule, sampleUltimate3} from './sample';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {VOICEOVER_DEFAULTS} from './voiceover-cut';

// Differential contract from 449f3d67 (last local commit before midnight Sep 28).
// Keep current chapter timing/Flow21; compare only the historical cloud behavior.
test('Ultimate2 handoff and Cost retain midnight cloud poses, not absolute frame-cloud extents', () => {
  for (const settings of [ULTIMATE_3_DEFAULTS, VOICEOVER_DEFAULTS]) {
    const costStart = chapterSchedule(settings)[1].start;
    const entry = settings.ultimate2.timing.cloudEnter;
    const sweep = settings.cost.timing.cloudSweep;
    // The current cut deliberately adds offscreen entry clearance; its settled
    // pose stays historical. cloud-entry-clearance.test.ts covers that trajectory.
    const entryProgress = settings.voiceover && settings.issues.sourceVersion === 22 ? 1 : .5;
    for (const time of [entry.at + entry.duration * entryProgress, costStart, costStart + sweep.at + sweep.duration / 2]) {
      const sample = sampleUltimate3(time, settings);
      const scene = Ultimate3Scene({sample, settings});
      const clouds = Children.toArray(scene.props.children).find(child => isValidElement(child) && child.type === DitherClouds);
      assert.ok(isValidElement(clouds), `${sample.chapter}: missing canonical cloud canvas`);
      if (sample.ultimate2) {
        const state = worldState(sample.ultimate2, settings.ultimate2.controls, settings.ultimate2.streamBlocksRemoved);
        assert.deepEqual(clouds.props, {progress: state.cloudProgress, yOffset: 27,
          translateY: state.cloudTranslateY, translateX: state.cloudTranslateX});
      } else {
        assert.ok(sample.cost);
        assert.deepEqual(clouds.props, {...sample.cost.cloud, yOffset: 27 + 10 * sample.cost.progress.cloudSweep});
      }
    }
  }
});

test('Flow clouds ride the incoming world, instead of staying pinned over the bridge', () => {
  for (const settings of [ULTIMATE_3_DEFAULTS, VOICEOVER_DEFAULTS]) {
    const start = chapterSchedule(settings)[2].start;
    const sample = sampleUltimate3(start + .1, settings);
    const html = renderToStaticMarkup(createElement(Ultimate3Scene, {sample, settings}));
    assert.match(html, /class="micro18-flow-cloud-layer"/);
    assert.match(html, /data-cloud-attachment="opening-world"/);
    assert.equal((html.match(/class="micro09-clouds"/g) ?? []).length, 1);
  }
});

test('saved frame-cloud controls cannot reactivate the reverted behavior or change other settings', () => {
  const base = VOICEOVER_DEFAULTS;
  const changed = normalizeSettings({...base, clouds: {controls: {x: .02, y: .01}, timing: {
    slideIn: {at: 0, duration: .1}, partialRecede: {at: .1, duration: .1}, recede: {at: .2, duration: .1},
  }}});
  const {clouds: _old, ...rest} = base;
  const {clouds: _new, ...other} = changed;
  assert.deepEqual(other, rest);
  for (const time of [20, 23, 37, 40, 49, 65]) {
    assert.deepEqual(sampleUltimate3(time, changed), sampleUltimate3(time, base));
  }
});
