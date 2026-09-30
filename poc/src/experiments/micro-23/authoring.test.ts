import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DialStore, type DialValue} from 'dialkit';
import {parseTimelineConfig} from 'dialkit/timeline';
import {installMicro20AuthoringCompatibility} from '../micro-20/authoring';
import {MICRO_23_KEYS, MICRO_23_TIMELINE, MICRO_23_TIMELINE_ID} from './timeline';
import {createMicro23Sampler} from './sample';

test('owned transition edits survive re-registration and preset selection without changing another panel', () => {
  const store = new (DialStore.constructor as new () => typeof DialStore)();
  // Match App's explicit duration (including its hold), and recompute that
  // duration after edits before re-registering, just as the live app does.
  const id = MICRO_23_TIMELINE_ID;
  const config = parseTimelineConfig({duration: createMicro23Sampler().duration, ...MICRO_23_TIMELINE}).dialConfig;
  installMicro20AuthoringCompatibility(store, undefined, true, id, MICRO_23_KEYS.map(key => `${key}.transition`));
  store.registerPanel('unrelated-animation23-test', 'Unrelated', {amount: [3, 0, 10]});
  store.registerPanel(id, 'Animation 23', config);
  const unrelated = JSON.stringify(store.getValues('unrelated-animation23-test'));
  const curve: DialValue = {type: 'easing', duration: 2, ease: [.12, .9, .3, 1]};
  for (const key of ['orangeDots', 'headlineReveal', 'headlineFadeOut']) {
    store.updateValue(id, `${key}.transition`, curve);
    store.updateTransitionMode(id, `${key}.transition`, 'easing');
  }
  store.updateValue(id, 'blueDots.duration', 8);
  const preset = store.savePreset(id, 'Long blue entrance');
  const updatedConfig = parseTimelineConfig({
    duration: createMicro23Sampler({values: store.getValues(id)}).duration, ...MICRO_23_TIMELINE,
  }).dialConfig;
  store.updatePanel(id, 'Animation 23', updatedConfig);
  for (const key of ['orangeDots', 'headlineReveal', 'headlineFadeOut']) assert.deepEqual(store.getValue(id, `${key}.transition`), curve);
  store.loadPreset(id, preset);
  for (const key of ['orangeDots', 'headlineReveal', 'headlineFadeOut']) {
    assert.deepEqual(store.getValue(id, `${key}.transition`), curve);
    assert.equal(store.getValue(id, `${key}.transition.__mode`), 'easing');
  }
  assert.equal(store.getValue(id, 'blueDots.duration'), 8);
  assert.ok(createMicro23Sampler({values: store.getValues(id)}).duration > MICRO_23_TIMELINE.blueDots.at + 8);
  assert.equal(JSON.stringify(store.getValues('unrelated-animation23-test')), unrelated);
});
