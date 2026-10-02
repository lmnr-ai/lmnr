import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {normalizeSettings} from './settings';
import {sampleUltimate3} from './sample';
import {VOICEOVER_DEFAULTS, readVoiceoverSettings, VOICEOVER_SETTINGS_ID} from './voiceover-cut';

// Historical frame-cloud metadata is kept losslessly; it is no longer a renderer input.
test('old frame-cloud settings round-trip without replacing native chapter settings', () => {
  const authored = normalizeSettings({...VOICEOVER_DEFAULTS, clouds: {controls: {x: .8, y: .3}, timing: {
    slideIn: {at: 2, duration: 1}, partialRecede: {at: 3, duration: 2}, recede: {at: 5, duration: 1},
  }}});
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(authored))), authored);
  const stored = readVoiceoverSettings({getItem: key => key === VOICEOVER_SETTINGS_ID ? JSON.stringify(authored) : null});
  assert.deepEqual(stored, authored);
  for (const time of [0, 20, 23, 37, 40, 49, 65])
    assert.deepEqual(sampleUltimate3(time, stored), sampleUltimate3(time, VOICEOVER_DEFAULTS));
});

test('main timeline no longer exposes or applies the reverted frame-cloud controls', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /frame clouds|cloudTimelineConfig|cloudTimelineValues|settingsFromCloudTimeline|cloudDials/);
  assert.match(app, /cloudEntrySpread/);
  assert.match(app, /cloudYOffset/);
});

test('the runtime has no global cloud sampler that saved absolute bars could reactivate', () => {
  const sampler = readFileSync(new URL('./sample.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('./Scene.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sampler, /sampleClouds/);
  assert.doesNotMatch(scene, /sample\.clouds/);
  assert.match(scene, /flowCloudScreenTransform/);
});
